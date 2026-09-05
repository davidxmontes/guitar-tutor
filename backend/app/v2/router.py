"""V2 routes — Session/Branch state, SongStudy raw data and enrichment,
and stateless tutor turns.

Everything here requires an authenticated user (or the AUTH_DEV_BYPASS dev
user). Other artifact kinds (Progression, ConceptStudy, Exercise) land in
their own later V2 tickets.
"""

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.config import Settings, get_settings
from app.dependencies.auth import get_current_user
from app.services import songsterr
from app.v2.models import Artifact, ArtifactKind, Branch, Session, SongStudyPayload, SongStudyTrack, TutorMessage
from app.v2.song_enrichment import run_song_enrichment
from app.v2.store import NotFoundError, V2Store, get_v2_store
from app.v2.tutor.contract import TutorResponse
from app.v2.tutor.providers import TutorCapabilityError, build_tutor_model
from app.v2.tutor.runner import ModelFactory, run_tutor_turn

router = APIRouter()


class UpdateBranchRequest(BaseModel):
    current_artifact_kind: Optional[ArtifactKind] = None
    current_artifact_id: Optional[str] = None
    selection: Optional[dict[str, Any]] = None
    focus: Optional[dict[str, Any]] = None
    recent_ideas: Optional[list[dict[str, Any]]] = None


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


@router.patch("/sessions/{session_id}/branches/{branch_id}", response_model=Branch)
async def update_branch(
    session_id: str,
    branch_id: str,
    data: UpdateBranchRequest,
    user_id: str = Depends(get_current_user),
    store: V2Store = Depends(get_v2_store),
):
    # exclude_unset (not `is not None`): a client explicitly clearing a field
    # to null must reach the store as null, distinct from simply omitting it.
    fields = data.model_dump(exclude_unset=True)
    try:
        return store.update_branch(session_id, branch_id, user_id, **fields)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc


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
    """Load the entire selected track (all measures) once and open it as the
    Branch's current SongStudy. No further tutor/agent call is required to
    browse the raw track afterward.
    """
    # Validate session/branch ownership up front — before the external
    # Songsterr fetch and the artifact write — so a stale/unowned branch_id
    # 404s cheaply instead of paying for a wasted fetch and an orphaned
    # Artifact row. update_branch() below re-checks the session anyway; that
    # duplication is fine, it's cheap and keeps this the single source of
    # truth for the actual write.
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
    )

    artifact = store.create_artifact(
        user_id=user_id,
        kind="song_study",
        title=f"{revision.artist} - {revision.title}",
        payload=payload.model_dump(),
    )

    try:
        store.update_branch(
            data.session_id,
            data.branch_id,
            user_id,
            current_artifact_kind="song_study",
            current_artifact_id=artifact.id,
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return artifact


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
            artifact = store.update_artifact(artifact.id, user_id, payload.model_dump())

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
    return store.update_artifact(artifact.id, user_id, payload.model_dump())


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
    return store.update_artifact(artifact.id, user_id, payload.model_dump())


def get_tutor_model_factory() -> ModelFactory:
    """Overridable in tests (`app.dependency_overrides[get_tutor_model_factory]`)
    to inject a recording/scripted chat-model factory with no real network
    call, same as `get_v2_store` above."""
    return build_tutor_model


class TutorTurnRequest(BaseModel):
    session_id: str
    branch_id: str
    message: str = Field(min_length=1)


@router.post("/tutor/turns", response_model=TutorResponse)
async def create_tutor_turn(
    data: TutorTurnRequest,
    user_id: str = Depends(get_current_user),
    store: V2Store = Depends(get_v2_store),
    settings: Settings = Depends(get_settings),
    model_factory: ModelFactory = Depends(get_tutor_model_factory),
):
    """One stateless tutor turn (ticket #13): reconstructs the Branch's
    persisted conversation plus current SongStudy/selection/focus, runs a
    fresh disposable agent execution, persists the new user/assistant
    messages, and returns the semantic TutorResponse. Session/branch
    ownership is validated up front — before any provider call — same
    discipline as create_song_study above.
    """
    try:
        session = store.get_session(data.session_id, user_id)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    branch = next((b for b in session.branches if b.id == data.branch_id), None)
    if branch is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Branch not found")

    artifact: Optional[Artifact] = None
    if branch.current_artifact_kind == "song_study" and branch.current_artifact_id:
        try:
            artifact = store.get_artifact(branch.current_artifact_id, user_id)
        except NotFoundError:
            artifact = None

    history = store.list_tutor_messages(branch.tutor_thread_id, user_id)

    try:
        response = run_tutor_turn(
            branch=branch,
            artifact=artifact,
            history=history,
            user_message=data.message,
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
        # Provider network/timeout/other API failures — fail clearly without
        # echoing the raw provider exception (it can carry key fragments).
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Tutor provider call to {settings.v2_tutor_provider} failed",
        ) from exc

    store.create_tutor_message(branch.tutor_thread_id, "user", {"text": data.message})
    store.create_tutor_message(
        branch.tutor_thread_id,
        "assistant",
        {"text": response.message, "focus": response.focus.model_dump() if response.focus else None},
    )

    return response


@router.get("/tutor/threads/{tutor_thread_id}/messages", response_model=list[TutorMessage])
async def list_tutor_thread_messages(
    tutor_thread_id: str,
    user_id: str = Depends(get_current_user),
    store: V2Store = Depends(get_v2_store),
):
    """Prior tutor messages for a Branch's thread (frontend history load on
    mount/branch change) — thin read over the existing store method, same
    auth/ownership/404 pattern as every other route above."""
    try:
        return store.list_tutor_messages(tutor_thread_id, user_id)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
