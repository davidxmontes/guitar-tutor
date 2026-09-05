"""V2 domain models — Session, Branch, Artifact, and the artifact-kind vocabulary.

Session = an ongoing exploration containing multiple branches.
Branch = one independent working context (current artifact reference,
selection, focus, recent ideas, tutor-thread identity).
Artifact = a durable musical thing (SongStudy, Progression, ConceptStudy,
Exercise) saved/reopened independently of the branch that created it —
common columns plus a JSON payload, strictly typed per kind (only
song_study's SongStudyPayload exists so far; the other three kinds get
their own payload types in their own tickets).
"""

from typing import Any, Literal, Optional, get_args

from pydantic import BaseModel, Field

ArtifactKind = Literal["song_study", "progression", "concept_study", "exercise"]

ARTIFACT_KINDS: tuple[str, ...] = get_args(ArtifactKind)


class Branch(BaseModel):
    id: str
    session_id: str
    tutor_thread_id: str
    current_artifact_kind: Optional[ArtifactKind] = None
    current_artifact_id: Optional[str] = None
    selection: Optional[dict[str, Any]] = None
    focus: Optional[dict[str, Any]] = None
    recent_ideas: list[dict[str, Any]] = Field(default_factory=list)
    created_at: str
    updated_at: str


class Session(BaseModel):
    id: str
    user_id: str
    branches: list[Branch]
    created_at: str
    updated_at: str


class SongStudyTrack(BaseModel):
    """Identity of the selected Songsterr track — index, instrument, and its
    own tuning. Never assume standard tuning; a track without a tuning here
    falls back to tab_data['tuning'] (see SongStudyPayload)."""

    index: int
    name: str
    instrument: str
    tuning: Optional[list[int]] = None


class SongStudyPayload(BaseModel):
    """Raw source of truth for a song_study artifact: the entire selected
    track loaded once from Songsterr. Basic browsing/selection/fretboard
    mapping must work from this alone — AI enrichment (later tickets) is
    additive, never required."""

    song_id: int
    artist: str
    title: str
    track: SongStudyTrack
    tab_data: dict[str, Any]  # {measures, tuning, name, automations, ...} as Songsterr returned it


class Artifact(BaseModel):
    """Common columns + a strict typed JSON payload per artifact kind.
    Only song_study payloads are validated (SongStudyPayload) as of this
    ticket; the other three kinds get their own payload types in their own
    tickets rather than a speculative shared union now.
    """

    id: str
    user_id: str
    kind: ArtifactKind
    title: str
    payload: dict[str, Any]
    created_at: str
    updated_at: str
