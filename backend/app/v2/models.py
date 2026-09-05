"""V2 domain models — Session, Branch, Artifact, and the artifact-kind vocabulary.

Session = an ongoing exploration containing multiple branches.
Branch = one independent working context (current artifact reference,
selection, focus, recent ideas, tutor-thread identity).
Artifact = a durable musical thing (SongStudy, Progression, ConceptStudy,
Exercise) saved/reopened independently of the branch that created it —
common columns plus a JSON payload, strictly typed per concrete artifact
route. SongStudy and ConceptStudy payloads exist so far.
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


ConceptId = Literal[
    "pentatonic_minor",
    "major_triad",
    "minor_triad",
    "perfect_fifth",
    "dominant_resolution",
]


class ConceptNote(BaseModel):
    note: str
    interval: str


class ConceptPosition(ConceptNote):
    string: int = Field(ge=1, le=6)
    fret: int = Field(ge=0, le=22)


class ConceptRelationship(BaseModel):
    id: str
    label: str
    explanation: str
    notes: list[ConceptNote]
    positions: list[ConceptPosition]


class ConceptStudyPayload(BaseModel):
    """Concrete persisted state for one theory workspace.

    Facts and physical positions are resolved deterministically by V2. The
    tutor can teach from them, but it does not own or mutate them.
    """

    concept_id: ConceptId
    root: str
    display_name: str
    explanation: str
    tuning: list[str]
    fret_start: int
    fret_end: int
    notes: list[ConceptNote]
    positions: list[ConceptPosition]
    relationships: list[ConceptRelationship]


class Artifact(BaseModel):
    """Common columns + a strict typed JSON payload per artifact kind.
    Concrete routes validate their payload before handing the plain JSON to
    this persistence envelope; this stays deliberately free of a generic
    artifact plugin/dispatch layer.
    """

    id: str
    user_id: str
    kind: ArtifactKind
    title: str
    payload: dict[str, Any]
    created_at: str
    updated_at: str


TutorMessageRole = Literal["user", "assistant", "tool"]


class TutorMessage(BaseModel):
    """One persisted message in a Branch's application-owned tutor
    conversation, keyed by Branch.tutor_thread_id — the durable memory the
    stateless-per-run V2 tutor (ticket #13) reconstructs from scratch on
    every request. No provider thread/response id is ever canonical; this
    row is the whole of "conversation memory".

    `content` is a plain dict rather than a fixed schema so it can hold
    either simple text (`{"text": "..."}`, user/assistant turns) or whatever
    a future tool call/result needs to round-trip (`tool_call_id`, `name`,
    args/results) — see app/v2/tutor/prompt.py's reconstruction.
    """

    id: str
    tutor_thread_id: str
    role: TutorMessageRole
    content: dict[str, Any]
    created_at: str
