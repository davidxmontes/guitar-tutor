"""V2 routes — Session/Branch state, SongStudy raw data and enrichment,
ConceptStudy artifact create/open, and stateless tutor turns.

Everything here requires an authenticated user (or the AUTH_DEV_BYPASS dev
user). Exercise saves copy deliberate drills independently of their source.
"""

from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from app.config import Settings, get_settings
from app.dependencies.auth import get_current_user
from app.services import songsterr
from app.v2.workspace_progressions import ProgressionAction, edit_progression, progression_starter
from app.v2.workspace_changes import InspectionTarget, apply_workspace_patch
from app.v2.workspace import ConceptWorkspace, StrictModel, resolve_workspace, scale_comparison, physical_resolution
from app.v2.concepts import build_concept_study, get_study_catalog
from app.v2.models import (
    CircleState,
    ApplyVoicingRequest,
    ExerciseDraft,
    ExercisePayload,
    ExerciseArtifact,
    Artifact,
    ArtifactKind,
    Branch,
    CagedQualityId,
    CagedShapeId,
    ConceptId,
    ConceptStudyPayload,
    ConceptStudyArtifact,
    ProgressionPayload,
    ScaleConceptId,
    Session,
    SongStudyPayload,
    SongSavedRange,
    SongStudyTrack,
    StudyCatalog,
    ChordQualityId,
    TutorMessage,
)
from app.v2.song_enrichment import run_song_enrichment
from app.v2.song_shapes import project_song_shapes
from app.v2.store import NotFoundError, RevisionConflictError, V2Store, get_v2_store
from app.v2.tutor.contract import TutorResponse, WorkspaceTurnResult
from app.v2.tutor.providers import TutorCapabilityError, build_tutor_model
from app.v2.tutor.runner import ModelFactory, run_tutor_turn
from app.v2.tutor.saved_work import saved_work_tools
from app.v2.tutor.branch_comparison import branch_tools

router = APIRouter()


class UpdateBranchRequest(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=120)
    current_artifact_kind: Optional[ArtifactKind] = None
    current_artifact_id: Optional[str] = None
    selection: Optional[dict[str, Any]] = None
    focus: Optional[dict[str, Any]] = None
    recent_ideas: Optional[list[dict[str, Any]]] = None
    closed: Optional[bool] = None


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

    artifact = store.create_artifact(
        user_id=user_id,
        kind="song_study",
        title=f"{revision.artist} - {revision.title}",
        payload=payload.model_dump(),
        saved=False,
    )

    try:
        store.update_branch(
            data.session_id,
            data.branch_id,
            user_id,
            title=payload.title,
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


class CreateConceptStudyRequest(BaseModel):
    session_id: str
    branch_id: str
    root: str = Field(min_length=1)
    concept_id: ConceptId
    comparison_id: Optional[ScaleConceptId] = None
    overlay: Literal["notes", "intervals"] = "notes"
    selected_interval: int = Field(7, ge=0, le=11)
    selected_voicing: int = Field(0, ge=0)
    comparison_quality: Optional[ChordQualityId] = None
    caged_quality: CagedQualityId = "major"
    selected_region: CagedShapeId = "C"
    comparison_region: Optional[CagedShapeId] = None
    selected_chord: int = Field(0, ge=0, le=6)
    selected_sequence: Literal["primary", "pop", "turnaround"] = "primary"
    promotion: Literal["save", "work_on_this"]


class OpenConceptStudyResponse(BaseModel):
    artifact: ConceptStudyArtifact
    branch: Branch


class WorkOnSavedConceptRequest(BaseModel):
    session_id: str
    branch_id: str


@router.get("/study/catalog", response_model=StudyCatalog)
async def get_concept_catalog(user_id: str = Depends(get_current_user)):
    return get_study_catalog()


@router.get("/study/visualizations/{concept_id}", response_model=ConceptStudyPayload)
async def get_study_visualization(
    concept_id: ConceptId,
    root: str,
    comparison_id: Optional[ScaleConceptId] = None,
    overlay: Literal["notes", "intervals"] = "notes",
    selected_interval: int = 7,
    selected_voicing: int = 0,
    comparison_quality: Optional[ChordQualityId] = None,
    caged_quality: CagedQualityId = "major",
    selected_region: CagedShapeId = "C",
    comparison_region: Optional[CagedShapeId] = None,
    selected_chord: int = 0,
    selected_sequence: str = "primary",
    user_id: str = Depends(get_current_user),
):
    try:
        return build_concept_study(
            root,
            concept_id,
            comparison_id=comparison_id,
            overlay=overlay,
            selected_interval=selected_interval,
            selected_voicing=selected_voicing,
            comparison_quality=comparison_quality,
            caged_quality=caged_quality,
            selected_region=selected_region,
            comparison_region=comparison_region,
            selected_chord=selected_chord, selected_sequence=selected_sequence,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc


@router.post("/concept-studies", response_model=OpenConceptStudyResponse, status_code=status.HTTP_201_CREATED)
async def create_concept_study(
    data: CreateConceptStudyRequest,
    user_id: str = Depends(get_current_user),
    store: V2Store = Depends(get_v2_store),
):
    try:
        session = store.get_session(data.session_id, user_id)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    if not any(branch.id == data.branch_id for branch in session.branches):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Branch not found")

    try:
        payload = build_concept_study(
            data.root,
            data.concept_id,
            comparison_id=data.comparison_id,
            overlay=data.overlay,
            selected_interval=data.selected_interval,
            selected_voicing=data.selected_voicing,
            comparison_quality=data.comparison_quality,
            caged_quality=data.caged_quality,
            selected_region=data.selected_region,
            comparison_region=data.comparison_region,
            selected_chord=data.selected_chord, selected_sequence=data.selected_sequence,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    source = next(branch for branch in session.branches if branch.id == data.branch_id)
    payload = payload.model_copy(update={"created_from": {"title": source.title, "branch_id": source.id, "artifact_id": source.current_artifact_id}})
    artifact = store.create_artifact(user_id, "concept_study", payload.display_name, payload.model_dump())
    concept_artifact = ConceptStudyArtifact.model_validate(artifact.model_dump())
    try:
        if data.promotion == "work_on_this":
            # ponytail: artifact + branch are two writes because the Supabase
            # client has no cross-table transaction API. Move this into one RPC
            # if orphaned artifacts are ever observed after branch-write errors.
            branch = store.create_branch(
                data.session_id,
                user_id,
                title=payload.display_name,
                current_artifact_kind="concept_study",
                current_artifact_id=artifact.id,
            )
        else:
            branch = next(branch for branch in session.branches if branch.id == data.branch_id)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return OpenConceptStudyResponse(artifact=concept_artifact, branch=branch)


@router.get("/concept-studies", response_model=list[ConceptStudyArtifact])
async def list_concept_studies(
    user_id: str = Depends(get_current_user),
    store: V2Store = Depends(get_v2_store),
):
    return [ConceptStudyArtifact.model_validate(item.model_dump()) for item in store.list_artifacts(user_id, "concept_study")]


@router.get("/concept-studies/{artifact_id}", response_model=ConceptStudyArtifact)
async def get_concept_study(
    artifact_id: str,
    user_id: str = Depends(get_current_user),
    store: V2Store = Depends(get_v2_store),
):
    try:
        artifact = store.get_artifact(artifact_id, user_id)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    if artifact.kind != "concept_study":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not a ConceptStudy artifact")
    return ConceptStudyArtifact.model_validate(artifact.model_dump())


@router.post("/concept-studies/{artifact_id}/work-on-this", response_model=OpenConceptStudyResponse, status_code=status.HTTP_201_CREATED)
async def work_on_saved_concept(
    artifact_id: str,
    data: WorkOnSavedConceptRequest,
    user_id: str = Depends(get_current_user),
    store: V2Store = Depends(get_v2_store),
):
    try:
        session = store.get_session(data.session_id, user_id)
        if not any(branch.id == data.branch_id for branch in session.branches):
            raise NotFoundError("Branch not found")
        artifact = store.get_artifact(artifact_id, user_id)
        if artifact.kind != "concept_study":
            raise NotFoundError("Not a ConceptStudy artifact")
        branch = store.create_branch(
            data.session_id,
            user_id,
            title=artifact.title,
            current_artifact_kind="concept_study",
            current_artifact_id=artifact.id,
            **_workspace_open_fields(artifact),
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return OpenConceptStudyResponse(
        artifact=ConceptStudyArtifact.model_validate(artifact.model_dump()),
        branch=branch,
    )


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


def get_tutor_model_factory() -> ModelFactory:
    """Overridable in tests (`app.dependency_overrides[get_tutor_model_factory]`)
    to inject a recording/scripted chat-model factory with no real network
    call, same as `get_v2_store` above."""
    return build_tutor_model


class TutorTurnRequest(BaseModel):
    session_id: str
    branch_id: str
    message: str = Field(min_length=1, max_length=12000)
    inspection: Optional[InspectionTarget] = None


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

    if data.inspection is not None:
        facts = resolve_workspace(branch.working_draft) if branch.working_draft else {}
        inspection = data.inspection
        source = next((facts.get(group, {}).get(inspection.source_id) for group in ('scales','chords','voicings','transitions') if inspection.source_id in facts.get(group, {})), None)
        valid = source and (inspection.key in {note['pitch_class'] for note in source.get('notes', source.get('positions', []))} if inspection.kind == 'pitch' else inspection.key == inspection.source_id and inspection.source_id in facts.get(inspection.kind + 's', {}))
        if not valid:
            raise HTTPException(status_code=422, detail="That inspection is no longer in the current draft. Select again.")

    artifact: Optional[Artifact] = None
    if branch.current_artifact_id:
        try:
            artifact = store.get_artifact(branch.current_artifact_id, user_id)
        except NotFoundError:
            artifact = None

    history = store.list_tutor_messages(branch.tutor_thread_id, user_id)

    try:
        response = await run_in_threadpool(run_tutor_turn,
            branch=branch,
            artifact=artifact,
            history=history,
            lookup_tools=saved_work_tools(store, user_id) + branch_tools(store, user_id, session.id),
            siblings=[{"id": b.id, "title": b.title, "artifact_kind": b.current_artifact_kind} for b in session.branches if not b.closed and b.id != branch.id],
            user_message=data.message,
            inspection=data.inspection,
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

    if response.focus:
        open_titles = {b.id: b.title for b in store.get_session(session.id, user_id).branches if not b.closed}
        response.focus.groups = [group.model_copy(update={"branch_title": open_titles[group.branch_id]}) for group in response.focus.groups if group.branch_id in open_titles]

    content = {
        'text': response.message, 'focus': response.focus.model_dump() if response.focus else None,
        'concept_suggestion': response.concept_suggestion.model_dump() if response.concept_suggestion else None,
        'exercise_suggestion': response.exercise_suggestion.model_dump() if response.exercise_suggestion else None,
        'voicing_candidates': [c.model_dump() for c in response.voicing_candidates] if response.voicing_candidates else None,
        'candidates': [c.model_dump() for c in response.candidates] if response.candidates else None,
    }
    if branch.working_draft is not None:
        workspace = None
        content['workspace_change'] = {'status': 'unchanged', 'reason': None}
        if response.workspace_patch is not None:
            try:
                workspace = apply_workspace_patch(branch.working_draft, response.workspace_patch, data.message)
                content['workspace_change']['status'] = 'applied'
            except ValueError:
                content['workspace_change'] = {'status': 'rejected', 'reason': 'No change was applied: the patch is invalid, unsupported, or based on an older draft. Ask again using the current workspace.'}
        updated, message = store.commit_workspace_turn(session.id, branch.id, user_id,
            expected_version=branch.working_draft.version, workspace=workspace, user_text=data.message, assistant=content)
        response.workspace_result = WorkspaceTurnResult(**message.content['workspace_change'], message_id=message.id, branch=updated)
    else:
        store.create_tutor_message(branch.tutor_thread_id, 'user', {'text': data.message})
        store.create_tutor_message(branch.tutor_thread_id, 'assistant', content)

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


@router.post("/progressions", response_model=Artifact, status_code=status.HTTP_201_CREATED)
async def create_progression(
    data: ProgressionPayload,
    user_id: str = Depends(get_current_user),
    store: V2Store = Depends(get_v2_store),
):
    """Persist a tutor-proposed candidate as a durable Progression artifact
    (ticket #14). Deliberately does not touch any Branch's
    current_artifact_kind/current_artifact_id -- saving a candidate must
    keep the SongStudy branch the user was working in current/active.
    """
    return store.create_artifact(user_id=user_id, kind="progression", title=data.title, payload=data.model_dump())


class ExploreProgressionRequest(BaseModel):
    session_id: str
    branch_id: str
    progression: ProgressionPayload


class OpenProgressionResponse(BaseModel):
    artifact: Artifact
    branch: Branch
    source_branch: Optional[Branch] = None


@router.post("/progressions/explore", response_model=OpenProgressionResponse, status_code=status.HTTP_201_CREATED)
async def explore_progression(
    data: ExploreProgressionRequest,
    user_id: str = Depends(get_current_user),
    store: V2Store = Depends(get_v2_store),
):
    try:
        session = store.get_session(data.session_id, user_id)
        source = next((branch for branch in session.branches if branch.id == data.branch_id), None)
        if source is None:
            raise NotFoundError("Branch not found")

        artifact = store.create_artifact(
            user_id=user_id,
            kind="progression",
            title=data.progression.title,
            payload=data.progression.model_dump(),
        )
        branch = store.create_branch(
            data.session_id,
            user_id,
            title=data.progression.title,
            current_artifact_kind="progression",
            current_artifact_id=artifact.id,
            selection={"type": "progression_chord", "index": 0},
            focus={"type": "progression_chord", "index": 0},
            fork_context={
                "source_branch_id": source.id,
                "source_artifact_kind": source.current_artifact_kind,
                "source_artifact_id": source.current_artifact_id,
                "source_selection": source.selection,
                "source_focus": source.focus,
                "intent": f"Explore {data.progression.title}",
            },
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return OpenProgressionResponse(artifact=artifact, branch=branch)


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


@router.patch("/progressions/{artifact_id}/voicing", response_model=Artifact)
async def apply_progression_voicing(
    artifact_id: str,
    data: ApplyVoicingRequest,
    user_id: str = Depends(get_current_user),
    store: V2Store = Depends(get_v2_store),
):
    try:
        artifact = store.get_artifact(artifact_id, user_id)
        if artifact.kind != "progression":
            raise NotFoundError("Not a Progression artifact")
        if data.expected_updated_at != artifact.updated_at:
            raise RevisionConflictError("Progression changed; request fresh voicings before applying")
        # Validate the replacement at the request boundary; preserve legacy slots.
        chords = list(artifact.payload["chords"])
        if data.chord_index >= len(chords):
            raise HTTPException(status_code=422, detail="Chord slot no longer exists")
        chords[data.chord_index] = data.chord.model_dump()
        return store.update_artifact(artifact_id, user_id, {**artifact.payload, "chords": chords}, data.expected_updated_at)
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RevisionConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


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
    if source.kind not in ("song_study", "progression", "concept_study"):
        raise HTTPException(422, "Choose song, progression or concept material")
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
    artifact = await get_exercise(artifact_id, user_id, store)
    # Same two-write session/branch persistence used elsewhere; no conversation is copied.
    session = store.create_session(user_id)
    store.update_branch(session.id, session.branches[0].id, user_id, title=artifact.title,
                        current_artifact_kind="exercise", current_artifact_id=artifact.id)
    return store.get_session(session.id, user_id)


class ExploreCircleRequest(CircleState):
    session_id: str
    branch_id: str


@router.post("/study/circle/explore", response_model=OpenProgressionResponse, status_code=201)
async def explore_circle(data: ExploreCircleRequest, user_id: str = Depends(get_current_user), store: V2Store = Depends(get_v2_store)):
    try:
        session = store.get_session(data.session_id, user_id)
        source = next((b for b in session.branches if b.id == data.branch_id), None)
        if source is None:
            raise NotFoundError("Branch not found")
        state = CircleState.model_validate(data.model_dump()).model_dump()
        payload = build_concept_study(concept_id="circle", **state)
        sequence = next(s for s in payload.sequences if s.id == payload.selected_sequence)
        # Semantic transient Study state belongs to this branch, not its source artifact.
        source = store.update_branch(data.session_id, data.branch_id, user_id,
            recent_ideas=[idea for idea in source.recent_ideas if idea.get("type") != "circle_study"] + [{"type": "circle_study", **state}])
        opened = await explore_progression(ExploreProgressionRequest(session_id=data.session_id, branch_id=data.branch_id,
            progression=ProgressionPayload(title=f"{payload.root} · {sequence.label}", chords=[payload.chords[i].chord for i in sequence.degrees],
                inspired_by={"study": "circle", **state})), user_id, store)
        opened.source_branch = source
        return opened
    except NotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


class SaveArtifactRequest(BaseModel):
    expected_updated_at: str


class RestoreArtifactRequest(SaveArtifactRequest):
    revision: str


@router.get("/library")
async def list_library(user_id: str = Depends(get_current_user), store: V2Store = Depends(get_v2_store)):
    return [{**a.model_dump(exclude={"payload"}), "provenance": a.payload.get("created_from") or a.payload.get("inspired_by") or ({"title": a.title, "song_id": a.payload.get("song_id"), "track": a.payload.get("track", {}).get("name")} if a.kind == "song_study" else None)}
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


def _workspace_open_fields(artifact: Artifact) -> dict:
    if artifact.kind == 'concept_study' and 'schema_version' in artifact.payload:
        try:
            draft = ConceptWorkspace.model_validate(artifact.payload).model_copy(update={'version': 1})
            resolve_workspace(draft)
        except ValueError as exc:
            raise HTTPException(422, 'This study is unsupported. Open a new exploration from Home.') from exc
        return {'working_draft': draft.model_dump(), 'saved_artifact_revision': artifact.updated_at}
    return {}


@router.post("/library/{artifact_id}/open", response_model=Session, status_code=201)
async def open_library_artifact(artifact_id: str, user_id: str = Depends(get_current_user), store: V2Store = Depends(get_v2_store)):
    artifact = _saved_artifact(store, artifact_id, user_id)
    fields = _workspace_open_fields(artifact)
    session = store.create_session(user_id)
    store.update_branch(session.id, session.branches[0].id, user_id, title=artifact.title,
        current_artifact_kind=artifact.kind, current_artifact_id=artifact.id, **fields)
    return store.get_session(session.id, user_id)


class SaveConceptRequest(BaseModel):
    expected_updated_at: str
    payload: ConceptStudyPayload


@router.patch("/concept-studies/{artifact_id}", response_model=ConceptStudyArtifact)
async def save_concept_selection(artifact_id: str, data: SaveConceptRequest, user_id: str = Depends(get_current_user), store: V2Store = Depends(get_v2_store)):
    original = await get_concept_study(artifact_id, user_id, store)
    if isinstance(original.payload, ConceptWorkspace):
        raise HTTPException(422, 'Open this study from My Stuff and use Save version in its workspace.')
    p = data.payload
    try:
        payload = build_concept_study(p.root, p.concept_id, overlay=p.overlay,
            comparison_id=getattr(p, "comparison_id", None),
            selected_interval=getattr(p, "selected_interval", 7), selected_voicing=getattr(p, "selected_voicing", 0),
            comparison_quality=getattr(p, "comparison_quality", None), caged_quality=getattr(p, "quality", "major"),
            selected_region=getattr(p, "selected_region", "C"), comparison_region=getattr(p, "comparison_region", None),
            selected_chord=getattr(p, "selected_chord", 0), selected_sequence=getattr(p, "selected_sequence", "primary"))
        payload = payload.model_copy(update={"created_from": original.payload.created_from})
        return store.update_artifact(artifact_id, user_id, payload.model_dump(), data.expected_updated_at, save=True)
    except RevisionConflictError as exc:
        raise HTTPException(409, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


# ConceptWorkspace draft routes intentionally do not create saved artifacts.


class OpenWorkspaceRequest(StrictModel):
    recipe: Literal['scale-comparison', 'physical-resolution', 'four-chord-progression']


@router.post('/sessions/{session_id}/concept-workspaces', response_model=Branch, status_code=201)
async def open_concept_workspace(session_id: str, data: OpenWorkspaceRequest,
    user_id: str = Depends(get_current_user), store: V2Store = Depends(get_v2_store)):
    try:
        workspace = progression_starter() if data.recipe == 'four-chord-progression' else physical_resolution() if data.recipe == 'physical-resolution' else scale_comparison()
        return store.create_branch(session_id, user_id, title=workspace.title,
            current_artifact_kind='concept_study', working_draft=workspace.model_dump())
    except NotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.post('/concept-workspaces/resolve')
async def resolve_concept_workspace(data: ConceptWorkspace, user_id: str = Depends(get_current_user)):
    try:
        return resolve_workspace(data)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


class SaveWorkspaceRequest(StrictModel):
    expected_version: int = Field(ge=1, strict=True)
    workspace: ConceptWorkspace


@router.put('/sessions/{session_id}/branches/{branch_id}/workspace', response_model=Branch)
async def save_workspace(session_id: str, branch_id: str, data: SaveWorkspaceRequest,
    user_id: str = Depends(get_current_user), store: V2Store = Depends(get_v2_store)):
    try:
        session = store.get_session(session_id, user_id)
        branch = next((b for b in session.branches if b.id == branch_id), None)
        if branch is None:
            raise NotFoundError('Branch not found')
        resolve_workspace(data.workspace)
        workspace = data.workspace.model_copy(update={'version': data.expected_version + 1})
        return store.update_branch(session_id, branch_id, user_id,
            working_draft=workspace.model_dump(), expected_workspace_version=data.expected_version)
    except NotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc
    except RevisionConflictError as exc:
        raise HTTPException(409, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


class UndoWorkspaceRequest(StrictModel):
    message_id: str = Field(min_length=1, max_length=80)
    expected_version: int = Field(ge=1, strict=True)


@router.post('/sessions/{session_id}/branches/{branch_id}/workspace/undo', response_model=WorkspaceTurnResult)
async def undo_workspace_change(session_id: str, branch_id: str, data: UndoWorkspaceRequest,
    user_id: str = Depends(get_current_user), store: V2Store = Depends(get_v2_store)):
    try:
        branch, message = store.commit_workspace_turn(session_id, branch_id, user_id,
            expected_version=data.expected_version, workspace=None, user_text=None,
            assistant={'text': 'Undid the latest Tutor change. The pre-turn workspace is current again; conversation and saved studies are unchanged.', 'workspace_change': {'status': 'undone', 'reason': None}},
            undo_message_id=data.message_id)
        return WorkspaceTurnResult(**message.content['workspace_change'], branch=branch, message_id=message.id)
    except NotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc
    except RevisionConflictError as exc:
        raise HTTPException(409, str(exc)) from exc


class SaveWorkspaceStudyRequest(StrictModel):
    expected_version: int = Field(ge=1, strict=True)
    title: str = Field(min_length=1, max_length=120)
    as_new: bool = False


@router.post('/sessions/{session_id}/branches/{branch_id}/workspace/save', response_model=Branch)
async def save_workspace_study(session_id: str, branch_id: str, data: SaveWorkspaceStudyRequest,
    user_id: str = Depends(get_current_user), store: V2Store = Depends(get_v2_store)):
    if not data.title.strip():
        raise HTTPException(422, 'Give your study a name.')
    try:
        return store.save_workspace_study(session_id, branch_id, user_id, expected_version=data.expected_version,
            title=data.title.strip(), as_new=data.as_new)
    except NotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc
    except RevisionConflictError as exc:
        raise HTTPException(409, str(exc)) from exc


@router.post('/sessions/{session_id}/branches/{branch_id}/workspace/restore', response_model=WorkspaceTurnResult)
async def restore_workspace_snapshot(session_id: str, branch_id: str, data: UndoWorkspaceRequest,
    user_id: str = Depends(get_current_user), store: V2Store = Depends(get_v2_store)):
    try:
        branch, message = store.commit_workspace_turn(session_id, branch_id, user_id,
            expected_version=data.expected_version, workspace=None, user_text=None,
            assistant={'text': 'Restored an earlier Tutor snapshot as the current draft. Later conversation and saved studies are unchanged.',
                'workspace_change': {'status': 'restored', 'reason': None}}, restore_message_id=data.message_id)
        return WorkspaceTurnResult(**message.content['workspace_change'], branch=branch, message_id=message.id)
    except NotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc
    except RevisionConflictError as exc:
        raise HTTPException(409, str(exc)) from exc


@router.post('/concept-workspaces/progression', response_model=ConceptWorkspace)
async def transform_progression(data: ProgressionAction, user_id: str = Depends(get_current_user)):
    try:
        return edit_progression(data)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
