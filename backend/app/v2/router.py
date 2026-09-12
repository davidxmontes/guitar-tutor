"""V2 routes — Session/Branch state, SongStudy raw data and enrichment,
Progression / Exercise artifacts, the library, and stateless tutor turns.

Ticket #101 hard cutover: the ConceptWorkspace catalog / create / update /
resolve / save / turn endpoints and the Progression fork (`/progressions/
explore`) are removed. A Branch no longer links an Artifact — opening a
library artifact just creates a fresh Session (DATA-03 reopen-to-fresh-draft
is ticket P1). The full Tutor per-turn contract is ticket T3.

Everything here requires an authenticated user (or the AUTH_DEV_BYPASS dev user).
"""

import asyncio
import logging
from time import monotonic
from uuid import uuid4
from typing import Any, Optional, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from app.config import Settings, get_settings
from app.dependencies.auth import get_current_user
from app.services import songsterr
from app.v2.models import (
    Artifact,
    Branch,
    ExerciseDraft,
    ExercisePayload,
    ExerciseArtifact,
    Session,
    SongStudyPayload,
    SongSavedRange,
    SongStudyTrack,
    TutorMessage,
    WorkspaceKind,
)
from app.v2.song_enrichment import run_song_enrichment
from app.v2.song_shapes import project_song_shapes
from app.v2.store import NotFoundError, RevisionConflictError, V2Store, get_v2_store
from app.v2.tutor.contract import LearningPreferences, TutorResponse
from app.v2.tutor.providers import TutorCapabilityError, build_tutor_model
from app.v2.tutor.runner import ModelFactory, run_tutor_turn
from app.v2.tutor.saved_work import saved_work_tools
from app.v2.tutor.branch_comparison import branch_tools
from app.v2.tutor.workspace_tools import workspace_tools

router = APIRouter()


# --- Sessions / Branches ---------------------------------------------------


@router.post("/sessions", response_model=Session, status_code=status.HTTP_201_CREATED)
async def create_session(
    user_id: str = Depends(get_current_user),
    store: V2Store = Depends(get_v2_store),
):
    return store.create_session(user_id)


@router.get("/sessions", response_model=list[Session])
async def list_sessions(
    user_id: str = Depends(get_current_user),
    store: V2Store = Depends(get_v2_store),
):
    return store.list_sessions(user_id)


@router.get("/sessions/{session_id}", response_model=Session)
async def get_session(
    session_id: str,
    user_id: str = Depends(get_current_user),
    store: V2Store = Depends(get_v2_store),
):
    try:
        return store.get_session(session_id, user_id)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str, user_id: str = Depends(get_current_user),
                         store: V2Store = Depends(get_v2_store)):
    try:
        store.delete_session(session_id, user_id)
        return {"deleted": True}
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


class CreateBranchRequest(BaseModel):
    """A conversational fork (UX-05): explicit alternative direction. Opens an
    empty Harmony Exploration unless a workspace is supplied (P1/H1 will)."""

    title: Optional[str] = Field(None, min_length=1, max_length=120)


@router.post("/sessions/{session_id}/branches", response_model=Branch, status_code=status.HTTP_201_CREATED)
async def create_branch(
    session_id: str,
    data: CreateBranchRequest,
    user_id: str = Depends(get_current_user),
    store: V2Store = Depends(get_v2_store),
):
    fields = data.model_dump(exclude_none=True)
    try:
        return store.create_branch(session_id, user_id, **fields)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


class UpdateBranchRequest(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=120)
    active_workspace: Optional[WorkspaceKind] = None
    live_presentation_turn_id: Optional[str] = None
    closed: Optional[bool] = None


@router.patch("/sessions/{session_id}/branches/{branch_id}", response_model=Branch)
async def update_branch(
    session_id: str,
    branch_id: str,
    data: UpdateBranchRequest,
    user_id: str = Depends(get_current_user),
    store: V2Store = Depends(get_v2_store),
):
    # exclude_unset (not `is not None`): a client explicitly clearing a field
    # to null must reach the store as null, distinct from omitting it.
    fields = data.model_dump(exclude_unset=True)
    try:
        return store.update_branch(session_id, branch_id, user_id, **fields)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc


# --- SongStudy -----------------------------------------------------------


class CreateSongStudyRequest(BaseModel):
    session_id: str
    branch_id: str
    song_id: int
    track_index: int = Field(0, ge=0)


@router.post("/song-studies", response_model=Artifact, status_code=status.HTTP_201_CREATED)
async def create_song_study(
    data: CreateSongStudyRequest,
    user_id: str = Depends(get_current_user),
    store: V2Store = Depends(get_v2_store),
):
    """Load the entire selected track once and persist it as a SongStudy
    artifact. Ticket #101: no longer linked onto the Branch (the branch↔
    artifact link is gone) — the artifact stands on its own."""
    try:
        session = store.get_session(data.session_id, user_id)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    if not any(b.id == data.branch_id for b in session.branches):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Branch not found")

    try:
        revision = await songsterr.get_song_revision(data.song_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Songsterr API error: {exc}") from exc

    if data.track_index >= len(revision.tracks):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Track index {data.track_index} out of range ({len(revision.tracks)} tracks available)",
        )
    if not revision.image:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No tab data available for this song")

    try:
        tab_data = await songsterr.get_tab_data(revision.song_id, revision.revision_id, revision.image, data.track_index)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Failed to fetch tab data: {exc}") from exc

    track = revision.tracks[data.track_index]
    tuning = track.tuning or tab_data.get("tuning")
    payload = SongStudyPayload(
        song_id=revision.song_id,
        artist=revision.artist,
        title=revision.title,
        track=SongStudyTrack(
            index=data.track_index,
            name=track.name or track.instrument,
            instrument=track.instrument,
            tuning=track.tuning,
        ),
        tab_data=tab_data,
        shape_events=project_song_shapes(tab_data, tuning),
    )

    return store.create_artifact(
        user_id=user_id,
        kind="song_study",
        title=f"{revision.artist} - {revision.title}",
        payload=payload.model_dump(),
        saved=False,
    )


@router.get("/song-studies/{artifact_id}", response_model=Artifact)
async def get_song_study(
    artifact_id: str,
    user_id: str = Depends(get_current_user),
    store: V2Store = Depends(get_v2_store),
):
    try:
        artifact = store.get_artifact(artifact_id, user_id)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    if artifact.kind != "song_study":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not a SongStudy artifact")
    return artifact


def get_enrichment_model_factory() -> ModelFactory:
    return build_tutor_model


def _owned_song_study(store: V2Store, artifact_id: str, user_id: str) -> tuple[Artifact, SongStudyPayload]:
    try:
        artifact = store.get_artifact(artifact_id, user_id)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    if artifact.kind != "song_study":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not a SongStudy artifact")
    return artifact, SongStudyPayload.model_validate(artifact.payload)


def _save_song_study(store: V2Store, artifact: Artifact, user_id: str, payload: SongStudyPayload) -> Artifact:
    try:
        return store.update_artifact(artifact.id, user_id, payload.model_dump(), artifact.updated_at)
    except RevisionConflictError as exc:
        raise HTTPException(409, "SongStudy changed; reload before trying again") from exc


class UpdateSongRangesRequest(BaseModel):
    expected_updated_at: str
    ranges: list[SongSavedRange] = Field(max_length=100)


@router.put("/song-studies/{artifact_id}/ranges", response_model=Artifact)
async def update_song_ranges(artifact_id: str, data: UpdateSongRangesRequest,
                             user_id: str = Depends(get_current_user), store: V2Store = Depends(get_v2_store)):
    artifact, payload = _owned_song_study(store, artifact_id, user_id)
    if artifact.updated_at != data.expected_updated_at:
        raise HTTPException(409, "SongStudy changed; reload before trying again")
    if any(item.end_measure > len(payload.tab_data.get("measures", [])) for item in data.ranges):
        raise HTTPException(422, "Range is outside the track")
    return _save_song_study(store, artifact, user_id, payload.model_copy(update={"saved_ranges": data.ranges}))


@router.post("/song-studies/{artifact_id}/enrichment", response_model=Artifact)
async def enhance_song_study(
    artifact_id: str,
    user_id: str = Depends(get_current_user),
    store: V2Store = Depends(get_v2_store),
    settings: Settings = Depends(get_settings),
    model_factory: ModelFactory = Depends(get_enrichment_model_factory),
):
    artifact, payload = _owned_song_study(store, artifact_id, user_id)

    if payload.chordpro is None:
        try:
            chordpro = await songsterr.get_chordpro(payload.song_id)
        except Exception:
            chordpro = None
        if chordpro:
            payload = payload.model_copy(update={"chordpro": chordpro})
            artifact = _save_song_study(store, artifact, user_id, payload)

    try:
        enrichment = run_song_enrichment(
            artifact_id=artifact.id,
            tab_data=payload.tab_data,
            chordpro=payload.chordpro,
            provider=settings.v2_tutor_provider,
            model=settings.v2_tutor_model_name,
            openai_api_key=settings.openai_api_key,
            anthropic_api_key=settings.anthropic_api_key,
            openrouter_api_key=settings.openrouter_api_key,
            model_factory=model_factory,
        )
    except TutorCapabilityError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Song enrichment provider call failed") from exc

    payload = payload.model_copy(update={"enrichment": enrichment})
    return _save_song_study(store, artifact, user_id, payload)


@router.delete("/song-studies/{artifact_id}/enrichment", response_model=Artifact)
async def remove_song_study_enrichment(
    artifact_id: str,
    user_id: str = Depends(get_current_user),
    store: V2Store = Depends(get_v2_store),
):
    artifact, payload = _owned_song_study(store, artifact_id, user_id)
    if payload.enrichment is None:
        return artifact
    payload = payload.model_copy(update={"enrichment": None})
    return _save_song_study(store, artifact, user_id, payload)


# --- Tutor ------------------------------------------------------------------


def get_tutor_model_factory() -> ModelFactory:
    """Overridable in tests to inject a recording/scripted chat-model factory."""
    return build_tutor_model


class TutorTurnRequest(BaseModel):
    request_id: str | None = Field(default=None, min_length=1, max_length=100)
    session_id: str
    branch_id: str
    message: str = Field(min_length=1, max_length=12000)
    learning_preferences: LearningPreferences = Field(default_factory=LearningPreferences)


@router.post("/tutor/turns", response_model=TutorResponse)
async def create_tutor_turn(
    data: TutorTurnRequest,
    user_id: str = Depends(get_current_user),
    store: V2Store = Depends(get_v2_store),
    settings: Settings = Depends(get_settings),
    model_factory: ModelFactory = Depends(get_tutor_model_factory),
):
    """One stateless tutor turn: reconstruct the Branch's persisted
    conversation, run a fresh disposable agent execution, persist the new
    user/assistant messages, return the semantic `TutorResponse`."""
    try:
        session = store.get_session(data.session_id, user_id)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    branch = next((b for b in session.branches if b.id == data.branch_id), None)
    if branch is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Branch not found")

    history = store.list_tutor_messages(branch.tutor_thread_id, user_id)

    try:
        response = await run_in_threadpool(
            run_tutor_turn,
            branch=branch,
            history=history,
            lookup_tools=saved_work_tools(store, user_id) + branch_tools(store, user_id, session.id) + workspace_tools(branch),
            siblings=[{"id": b.id, "title": b.title, "active_workspace": b.active_workspace}
                      for b in session.branches if not b.closed and b.id != branch.id],
            user_message=data.message,
            learning_preferences=data.learning_preferences,
            provider=settings.v2_tutor_provider,
            model=settings.v2_tutor_model_name,
            openai_api_key=settings.openai_api_key,
            anthropic_api_key=settings.anthropic_api_key,
            openrouter_api_key=settings.openrouter_api_key,
            model_factory=model_factory,
        )
    except TutorCapabilityError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Tutor provider call to {settings.v2_tutor_provider} failed",
        ) from exc

    if response.comparison_groups:
        open_titles = {b.id: b.title for b in store.get_session(session.id, user_id).branches if not b.closed}
        response.comparison_groups = [group.model_copy(update={"branch_title": open_titles[group.branch_id]})
                                      for group in response.comparison_groups if group.branch_id in open_titles]

    content = {
        'text': response.message,
        'comparison_groups': [group.model_dump() for group in response.comparison_groups],
        'candidates': response.candidates.model_dump() if response.candidates else None,
        'presentation': response.presentation.model_dump(),
    }
    try:
        updated = store.commit_workspace_turn(branch, user_id, response.musical_state, data.message, content)
    except RevisionConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    response.branch = updated.model_dump()
    return response


class TutorJob(BaseModel):
    id: str
    message: str
    status: Literal["running", "completed", "failed"] = "running"
    result: TutorResponse | None = None
    error: str | None = None


def tutor_jobs(request: Request) -> dict:
    # ponytail: one Render process, like the current memory session store.
    # Use a durable queue/store before adding workers or surviving server restarts.
    if not hasattr(request.app.state, "tutor_jobs"):
        request.app.state.tutor_jobs = {}
        request.app.state.tutor_tasks = set()
    jobs = request.app.state.tutor_jobs
    for key, (job, created) in list(jobs.items()):
        if job.status != "running" and monotonic() - created > 86400:
            del jobs[key]
    return jobs


def owned_tutor_branch(store: V2Store, session_id: str, branch_id: str, user_id: str):
    try:
        session = store.get_session(session_id, user_id)
        return next(branch for branch in session.branches if branch.id == branch_id)
    except (NotFoundError, StopIteration) as exc:
        raise HTTPException(status_code=404, detail="Branch not found") from exc


@router.post("/tutor/jobs", response_model=TutorJob, status_code=202)
async def start_tutor_job(
    data: TutorTurnRequest, request: Request,
    user_id: str = Depends(get_current_user), store: V2Store = Depends(get_v2_store),
    settings: Settings = Depends(get_settings),
    model_factory: ModelFactory = Depends(get_tutor_model_factory),
):
    owned_tutor_branch(store, data.session_id, data.branch_id, user_id)
    jobs = tutor_jobs(request)
    key = (user_id, data.session_id, data.branch_id)
    previous = jobs.get(key)
    if previous and (previous[0].status == "running" or previous[0].id == data.request_id):
        if previous[0].message != data.message:
            raise HTTPException(status_code=409, detail="A Tutor question is already in progress.")
        return previous[0]
    if len(jobs) >= 1000 and key not in jobs:
        raise HTTPException(status_code=429, detail="The Tutor is busy. Please try again shortly.")
    job = TutorJob(id=data.request_id or str(uuid4()), message=data.message)
    jobs[key] = (job, monotonic())

    async def finish():
        try:
            job.result = await create_tutor_turn(data, user_id, store, settings, model_factory)
            job.status = "completed"
        except Exception as exc:
            cause = exc
            while cause.__cause__ is not None:
                cause = cause.__cause__
            logging.getLogger(__name__).warning("Tutor job %r failed: %s: %.2000s", job.id, type(cause).__name__, cause)
            if isinstance(exc, HTTPException) and exc.status_code == 409:
                job.error = "The music changed while the Tutor was working. Please ask again."
            elif isinstance(exc, HTTPException) and exc.status_code == 422:
                job.error = "The Tutor returned a suggestion this view could not apply. Your question is kept; please try again."
            elif getattr(cause, 'status_code', None) == 429:
                job.error = "The Tutor provider is busy. Your question is kept; please try again shortly."
            else:
                job.error = "The Tutor could not finish this turn. Please try again."
            job.status = "failed"

    task = asyncio.create_task(finish())
    request.app.state.tutor_tasks.add(task)
    task.add_done_callback(request.app.state.tutor_tasks.discard)
    return job


@router.get("/tutor/jobs", response_model=TutorJob | None)
async def latest_tutor_job(
    session_id: str, branch_id: str, request: Request,
    user_id: str = Depends(get_current_user), store: V2Store = Depends(get_v2_store),
):
    owned_tutor_branch(store, session_id, branch_id, user_id)
    entry = tutor_jobs(request).get((user_id, session_id, branch_id))
    return entry[0] if entry else None


class TurnRestoreRequest(BaseModel):
    session_id: str
    branch_id: str
    turn_id: str
    undo: bool = False
    expected_updated_at: str | None = None


@router.post('/tutor/restore')
async def restore_tutor_turn(data: TurnRestoreRequest, user_id: str = Depends(get_current_user), store: V2Store = Depends(get_v2_store)):
    from app.v2.turns import live_composition
    try:
        session = store.get_session(data.session_id, user_id)
        branch = next((b for b in session.branches if b.id == data.branch_id), None)
        if branch is None:
            raise NotFoundError('Branch not found')
        if data.expected_updated_at and branch.updated_at != data.expected_updated_at:
            raise RevisionConflictError('The music has changed. Refresh before restoring a turn.')
        updated = store.restore_workspace_turn(branch, user_id, data.turn_id, undo=data.undo)
        return {'branch': updated, 'presentation': live_composition(updated, store.list_tutor_messages(updated.tutor_thread_id, user_id))}
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RevisionConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/tutor/threads/{tutor_thread_id}/messages", response_model=list[TutorMessage])
async def list_tutor_thread_messages(
    tutor_thread_id: str,
    user_id: str = Depends(get_current_user),
    store: V2Store = Depends(get_v2_store),
):
    try:
        return store.list_tutor_messages(tutor_thread_id, user_id)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


# --- Progression artifacts ------------------------------------------------


@router.get("/progressions/{artifact_id}", response_model=Artifact)
async def get_progression(
    artifact_id: str,
    user_id: str = Depends(get_current_user),
    store: V2Store = Depends(get_v2_store),
):
    try:
        artifact = store.get_artifact(artifact_id, user_id)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    if artifact.kind != "progression":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not a Progression artifact")
    return artifact


# --- Exercise artifacts --------------------------------------------------


class CreateExerciseRequest(ExerciseDraft):
    source_artifact_id: str
    expected_updated_at: str
    source_selection: Optional[dict[str, Any]] = None


@router.post("/exercises", response_model=ExerciseArtifact, status_code=201)
async def create_exercise(data: CreateExerciseRequest, user_id: str = Depends(get_current_user), store: V2Store = Depends(get_v2_store)):
    try:
        source = store.get_artifact(data.source_artifact_id, user_id)
    except NotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc
    if source.kind not in ("song_study", "progression"):
        raise HTTPException(422, "Choose song or progression material")
    if source.updated_at != data.expected_updated_at:
        raise HTTPException(409, "Source changed; review the current material before saving")
    payload = ExercisePayload(
        **data.model_dump(include={"title", "intent", "tempo", "steps"}),
        created_from={"artifact_id": source.id, "kind": source.kind, "title": source.title,
                      "updated_at": source.updated_at, "selection": data.source_selection},
    )
    return store.create_artifact(user_id, "exercise", data.title, payload.model_dump())


@router.get("/exercises", response_model=list[ExerciseArtifact])
async def list_exercises(user_id: str = Depends(get_current_user), store: V2Store = Depends(get_v2_store)):
    return store.list_artifacts(user_id, "exercise")


@router.get("/exercises/{artifact_id}", response_model=ExerciseArtifact)
async def get_exercise(artifact_id: str, user_id: str = Depends(get_current_user), store: V2Store = Depends(get_v2_store)):
    try:
        artifact = store.get_artifact(artifact_id, user_id)
        if artifact.kind != "exercise":
            raise NotFoundError("Exercise not found")
        return artifact
    except NotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.post("/exercises/{artifact_id}/open", response_model=Session, status_code=201)
async def open_exercise(artifact_id: str, user_id: str = Depends(get_current_user), store: V2Store = Depends(get_v2_store)):
    await get_exercise(artifact_id, user_id, store)
    # Ticket #101: reopen no longer links the artifact onto the branch; a
    # fresh Session with a main Harmony Branch. P1 wires artifact reopen.
    session = store.create_session(user_id)
    return store.get_session(session.id, user_id)


# --- Library ------------------------------------------------------------


class SaveArtifactRequest(BaseModel):
    expected_updated_at: str


class RestoreArtifactRequest(SaveArtifactRequest):
    revision: str


@router.get("/library")
async def list_library(user_id: str = Depends(get_current_user), store: V2Store = Depends(get_v2_store)):
    return [{**a.model_dump(exclude={"payload"}),
             "provenance": a.payload.get("created_from") or a.payload.get("inspired_by")
             or ({"title": a.title, "song_id": a.payload.get("song_id"),
                  "track": a.payload.get("track", {}).get("name")} if a.kind == "song_study" else None)}
            for a in store.list_artifacts(user_id) if a.saved_at]


@router.post("/library/{artifact_id}/save", response_model=Artifact)
async def save_artifact(artifact_id: str, data: SaveArtifactRequest, user_id: str = Depends(get_current_user), store: V2Store = Depends(get_v2_store)):
    try:
        artifact = store.get_artifact(artifact_id, user_id)
        return store.update_artifact(artifact_id, user_id, artifact.payload, data.expected_updated_at, save=True)
    except NotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc
    except RevisionConflictError as exc:
        raise HTTPException(409, str(exc)) from exc


def _saved_artifact(store: V2Store, artifact_id: str, user_id: str) -> Artifact:
    try:
        artifact = store.get_artifact(artifact_id, user_id)
        if not artifact.saved_at:
            raise NotFoundError("Save this work before opening it from My Stuff")
        return artifact
    except NotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.get("/library/{artifact_id}/revisions")
async def artifact_revisions(artifact_id: str, user_id: str = Depends(get_current_user), store: V2Store = Depends(get_v2_store)):
    artifact = _saved_artifact(store, artifact_id, user_id)
    return [{"revision": r.revision, "current": False} for r in artifact.revisions] + [{"revision": artifact.updated_at, "current": True}]


@router.post("/library/{artifact_id}/restore", response_model=Artifact)
async def restore_artifact(artifact_id: str, data: RestoreArtifactRequest, user_id: str = Depends(get_current_user), store: V2Store = Depends(get_v2_store)):
    artifact = _saved_artifact(store, artifact_id, user_id)
    revision = next((r for r in artifact.revisions if r.revision == data.revision), None)
    if revision is None:
        raise HTTPException(404, "Revision not found")
    try:
        return store.update_artifact(artifact_id, user_id, revision.payload, data.expected_updated_at)
    except RevisionConflictError as exc:
        raise HTTPException(409, str(exc)) from exc


@router.post("/library/{artifact_id}/open", response_model=Session, status_code=201)
async def open_library_artifact(artifact_id: str, user_id: str = Depends(get_current_user), store: V2Store = Depends(get_v2_store)):
    _saved_artifact(store, artifact_id, user_id)
    artifact = store.get_artifact(artifact_id, user_id)
    session = store.create_session(user_id)
    if artifact.kind == 'progression':
        reopen_progression(store, session.branches[0], artifact, user_id)
    return store.get_session(session.id, user_id)


# --- Harmony: deterministic entry and learner-owned musical controls ---
from uuid import uuid4
from app.v2.harmony_state import ChordRef, HarmonyExploration, HarmonyFocus, TonalCenter, Tuning, PinnedVoicing
from app.v2.harmony import change_subject, change_tuning, resolve_harmony, pin_voicing, unpin_voicing
from app.v2.workspace import StrictModel
from app.v2.harmony_actions import HarmonyMutation, mutate_harmony
from app.v2.turns import live_composition
from app.v2.concepts import SCALE_NAMES, CIRCLE_KEYS
from app.services.scale_service import VALID_ROOTS


class HarmonyEdit(StrictModel):
    tonal_center: TonalCenter | None = None
    tuning: Tuning | None = None
    focus: HarmonyFocus | None = None
    add_scratch: ChordRef | None = None
    mutation: HarmonyMutation | None = None
    pin: PinnedVoicing | None = None
    unpin: PinnedVoicing | None = None


def owned_branch(store, session_id, branch_id, user_id):
    try:
        session = store.get_session(session_id, user_id)
        branch = next((b for b in session.branches if b.id == branch_id), None)
        if branch is None:
            raise NotFoundError('Branch not found')
        return branch
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


def harmony_response(branch, store, user_id):
    if branch.harmony_exploration is None:
        raise HTTPException(status_code=422, detail='No Harmony Exploration')
    return {'branch': branch, 'resolved': resolve_harmony(branch.harmony_exploration),
            'composition': live_composition(branch, store.list_tutor_messages(branch.tutor_thread_id, user_id)),
            'catalog': {'roots': VALID_ROOTS, 'scales': SCALE_NAMES, 'circle_keys': CIRCLE_KEYS, 'qualities': list(CHORD_INTERVALS)}}


@router.post('/harmony/open', response_model=Session)
async def open_harmony(subject: TonalCenter | ChordRef, user_id: str = Depends(get_current_user), store: V2Store = Depends(get_v2_store)):
    session = store.create_session(user_id)
    branch = session.branches[0]
    is_scale = isinstance(subject, TonalCenter)
    label = f'{subject.root} {subject.scale if is_scale else subject.quality}'
    state = HarmonyExploration(tonal_center=subject if is_scale else None,
        focus={'kind': 'scale'} if is_scale else {'kind': 'chord', 'chord': subject},
        provenance={'kind': 'concept-seed', 'concept': label})
    store.update_branch(session.id, branch.id, user_id, title=label.replace('_', ' '), harmony_exploration=state)
    return store.get_session(session.id, user_id)


@router.post('/harmony/resolve')
async def resolve_harmony_preview(state: HarmonyExploration, user_id: str = Depends(get_current_user)):
    return resolve_harmony(state)


@router.get('/sessions/{session_id}/branches/{branch_id}/harmony')
async def read_harmony_surface(session_id: str, branch_id: str, user_id: str = Depends(get_current_user), store: V2Store = Depends(get_v2_store)):
    return harmony_response(owned_branch(store, session_id, branch_id, user_id), store, user_id)


@router.patch('/sessions/{session_id}/branches/{branch_id}/harmony')
async def edit_harmony_surface(session_id: str, branch_id: str, edit: HarmonyEdit, user_id: str = Depends(get_current_user), store: V2Store = Depends(get_v2_store)):
    branch = owned_branch(store, session_id, branch_id, user_id)
    state = branch.harmony_exploration
    if state is None:
        raise HTTPException(status_code=422, detail='No Harmony Exploration')
    try:
        if 'tonal_center' in edit.model_fields_set:
            state = change_subject(state, edit.tonal_center)
        if edit.tuning is not None:
            state = change_tuning(state, edit.tuning)
        data = state.model_dump()
        if edit.focus is not None:
            data['focus'] = edit.focus.model_dump()
        if edit.add_scratch is not None:
            data['scratch'].append({'id': uuid4().hex, **edit.add_scratch.model_dump()})
        state = HarmonyExploration.model_validate(data)
        if edit.mutation is not None:
            state = mutate_harmony(state, edit.mutation)
        if edit.pin is not None:
            state = pin_voicing(state, edit.pin.chord, edit.pin.voicing)
        if edit.unpin is not None:
            state = unpin_voicing(state, edit.unpin.chord, edit.unpin.voicing)
        updated = store.update_branch(session_id, branch_id, user_id, harmony_exploration=state)
        return harmony_response(updated, store, user_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


class ExploreRequest(StrictModel):
    subject: ChordRef | TonalCenter
    confirmed: bool = False


@router.post('/sessions/{session_id}/branches/{branch_id}/explore')
async def explore_subject(session_id: str, branch_id: str, data: ExploreRequest, user_id: str = Depends(get_current_user), store: V2Store = Depends(get_v2_store)):
    from app.v2.harmony_actions import explore_harmony
    current = owned_branch(store, session_id, branch_id, user_id)
    updated, confirmation = explore_harmony(current, data.subject, data.confirmed)
    if confirmation:
        return {'branch': current, 'requires_confirmation': True}
    branch = store.update_branch(session_id, branch_id, user_id, harmony_exploration=updated.harmony_exploration, active_workspace='harmony')
    return {'branch': branch, 'requires_confirmation': False}


@router.post('/sessions/{session_id}/branches/{branch_id}/develop')
async def develop_scratch(session_id: str, branch_id: str, user_id: str = Depends(get_current_user), store: V2Store = Depends(get_v2_store)):
    from app.v2.progression_tutor import develop_harmony
    current = owned_branch(store, session_id, branch_id, user_id)
    try:
        developed = develop_harmony(current)
        updated = store.update_branch(session_id, branch_id, user_id, expected_updated_at=current.updated_at,
            progression_workspace=developed.progression_workspace, active_workspace='progression', live_presentation_turn_id=None)
        return {'available': True, 'branch': updated, 'message': 'Scratch developed into a new idea.'}
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except RevisionConflictError as exc:
        raise HTTPException(409, str(exc)) from exc


# --- Progression idea Save / reopen ---
from app.v2.progression_state import ProgressionArtifactPayload, ProgressionIdeaDraft, ProgressionWorkspaceState


def reopen_progression(store, branch, artifact, user_id):
    payload = ProgressionArtifactPayload.model_validate(artifact.payload)
    idea = ProgressionIdeaDraft(label=payload.title, **payload.model_dump(exclude={'title'}),
        artifact_id=artifact.id, base_revision_id=artifact.updated_at, dirty=False)
    workspace = branch.progression_workspace or ProgressionWorkspaceState()
    updated = ProgressionWorkspaceState(ideas=[*workspace.ideas, idea], active_idea_id=idea.id)
    return store.update_branch(branch.session_id, branch.id, user_id, progression_workspace=updated,
                               active_workspace='progression', live_presentation_turn_id=None)


class SaveIdeaRequest(StrictModel):
    expected_updated_at: str


@router.post('/sessions/{session_id}/branches/{branch_id}/progression/save')
async def save_progression_idea(session_id: str, branch_id: str, data: SaveIdeaRequest, user_id: str = Depends(get_current_user), store: V2Store = Depends(get_v2_store)):
    branch = owned_branch(store, session_id, branch_id, user_id)
    try:
        if branch.updated_at != data.expected_updated_at:
            raise RevisionConflictError('Workspace changed')
        updated, artifact = store.save_progression_idea(branch, user_id)
        return {'branch': updated, 'artifact': artifact}
    except NotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc
    except RevisionConflictError as exc:
        raise HTTPException(409, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.post('/sessions/{session_id}/branches/{branch_id}/progression/open/{artifact_id}')
async def open_progression_idea(session_id: str, branch_id: str, artifact_id: str, user_id: str = Depends(get_current_user), store: V2Store = Depends(get_v2_store)):
    branch = owned_branch(store, session_id, branch_id, user_id)
    artifact = _saved_artifact(store, artifact_id, user_id)
    if artifact.kind != 'progression':
        raise HTTPException(422, 'Choose a progression artifact')
    return reopen_progression(store, branch, artifact, user_id)


from app.v2.progression_actions import ProgressionEdit, edit_progression
from app.v2.progression import resolve_progression
from app.music.chords import CHORD_INTERVALS


def progression_response(branch, store, user_id):
    workspace = branch.progression_workspace
    if workspace is None:
        raise HTTPException(422, 'No Progression Workspace')
    return {'branch': branch, 'resolved': {idea.id: resolve_progression(idea) for idea in workspace.ideas},
            'composition': live_composition(branch, store.list_tutor_messages(branch.tutor_thread_id, user_id)),
            'catalog': {'roots': VALID_ROOTS, 'qualities': list(CHORD_INTERVALS), 'scales': SCALE_NAMES}}


@router.post('/progression/open', response_model=Session)
async def open_progression_recipe(user_id: str = Depends(get_current_user), store: V2Store = Depends(get_v2_store)):
    session = store.create_session(user_id)
    idea = ProgressionIdeaDraft(label='Four-chord progression', tonal_center={'root': 'C', 'scale': 'major'},
        chords=[{'root': root, 'quality': quality} for root, quality in [('C','major'),('G','major'),('A','minor'),('F','major')]])
    store.update_branch(session.id, session.branches[0].id, user_id, title=idea.label, harmony_exploration=None,
        progression_workspace=ProgressionWorkspaceState(ideas=[idea], active_idea_id=idea.id), active_workspace='progression')
    return store.get_session(session.id, user_id)


@router.get('/sessions/{session_id}/branches/{branch_id}/progression')
async def read_progression_surface(session_id: str, branch_id: str, user_id: str = Depends(get_current_user), store: V2Store = Depends(get_v2_store)):
    return progression_response(owned_branch(store, session_id, branch_id, user_id), store, user_id)


@router.patch('/sessions/{session_id}/branches/{branch_id}/progression')
async def edit_progression_surface(session_id: str, branch_id: str, edit: ProgressionEdit, user_id: str = Depends(get_current_user), store: V2Store = Depends(get_v2_store)):
    branch = owned_branch(store, session_id, branch_id, user_id)
    if branch.progression_workspace is None:
        raise HTTPException(422, 'No Progression Workspace')
    try:
        workspace = edit_progression(branch.progression_workspace, edit)
        updated = store.update_branch(session_id, branch_id, user_id, progression_workspace=workspace)
        return progression_response(updated, store, user_id)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


class IdeaExerciseRequest(StrictModel):
    title: str
    intent: str
    tempo: int = 80
    order: list[str]
    expected_updated_at: str


@router.post('/sessions/{session_id}/branches/{branch_id}/progression/exercise', response_model=ExerciseArtifact, status_code=201)
async def compose_idea_exercise(session_id: str, branch_id: str, data: IdeaExerciseRequest, user_id: str = Depends(get_current_user), store: V2Store = Depends(get_v2_store)):
    from app.v2.progression import exercise_from_idea
    branch = owned_branch(store, session_id, branch_id, user_id)
    if branch.updated_at != data.expected_updated_at:
        raise HTTPException(409, 'Idea changed; review the current material')
    workspace = branch.progression_workspace
    idea = next((idea for idea in workspace.ideas if idea.id == workspace.active_idea_id), None) if workspace else None
    if idea is None:
        raise HTTPException(422, 'Choose an idea')
    try:
        payload = exercise_from_idea(idea, data.title, data.intent, data.tempo, data.order)
        return store.create_artifact(user_id, 'exercise', data.title, payload)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


class KeepCandidateRequest(StrictModel):
    turn_id: str
    candidate_id: str
    develop: bool = False


@router.post('/sessions/{session_id}/branches/{branch_id}/candidates/keep')
async def keep_progression_candidate(session_id: str, branch_id: str, data: KeepCandidateRequest, user_id: str = Depends(get_current_user), store: V2Store = Depends(get_v2_store)):
    from app.v2.progression_tutor import keep_candidate
    branch = owned_branch(store, session_id, branch_id, user_id)
    turn = next((turn for turn in store.list_tutor_messages(branch.tutor_thread_id, user_id) if turn.id == data.turn_id and turn.role == 'assistant'), None)
    candidate_set = turn.content.get('candidates') if turn else None
    candidate = next((value for value in candidate_set['candidates'] if value['id'] == data.candidate_id), None) if candidate_set else None
    if candidate is None: raise HTTPException(404, 'Candidate not found')
    if data.develop and candidate_set['candidate_kind'] != 'progression-idea': raise HTTPException(422, 'Only an idea can be developed')
    try:
        updated = keep_candidate(branch, candidate_set['candidate_kind'], candidate)
        fields = {'progression_workspace': updated.progression_workspace, 'active_workspace': 'progression'}
        if data.develop: fields['live_presentation_turn_id'] = None
        return store.update_branch(session_id, branch_id, user_id, expected_updated_at=branch.updated_at, **fields)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except RevisionConflictError as exc:
        raise HTTPException(409, str(exc)) from exc
