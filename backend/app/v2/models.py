"""V2 domain models — Session, Branch, Artifact, and the artifact-kind vocabulary.

Session = an ongoing exploration containing multiple branches.
Branch = one conversational direction: a shared Tutor thread plus a Harmony
Exploration and/or a Progression Workspace (Spec #100 §5.1).
Artifact = a durable musical thing (SongStudy, Progression, Exercise)
saved/reopened independently of the branch that created it — common columns
plus a JSON payload, strictly typed per concrete artifact route.
"""

from typing import Annotated, Any, Literal, Optional

from pydantic import BaseModel, Field, model_validator
from app.v2.harmony_state import HarmonyExploration

ArtifactKind = Literal["song_study", "progression", "exercise"]

WorkspaceKind = Literal["harmony", "progression"]


from app.v2.progression_state import ProgressionWorkspaceState


class Branch(BaseModel):
    id: str
    session_id: str
    tutor_thread_id: str
    title: str = "New workspace"
    harmony_exploration: Optional[HarmonyExploration] = None
    progression_workspace: Optional[ProgressionWorkspaceState] = None
    active_workspace: WorkspaceKind = "harmony"
    live_presentation_turn_id: Optional[str] = None
    closed: bool = False
    created_at: str
    updated_at: str

    @model_validator(mode="after")
    def _active_workspace_present(self) -> "Branch":
        present = {"harmony": self.harmony_exploration, "progression": self.progression_workspace}
        if all(value is None for value in present.values()):
            raise ValueError("A Branch must have at least one workspace")
        if present[self.active_workspace] is None:
            raise ValueError(f"active_workspace {self.active_workspace!r} names an absent workspace")
        return self


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


class SongSourceSection(BaseModel):
    label: str
    start_measure: int = Field(ge=1)
    end_measure: int = Field(ge=1)
    source: Literal["tab", "chordpro"]

    @model_validator(mode="after")
    def validate_range(self) -> "SongSourceSection":
        if self.end_measure < self.start_measure:
            raise ValueError("end_measure must not precede start_measure")
        return self


class SongSavedRange(BaseModel):
    label: str = Field(min_length=1, max_length=120)
    start_measure: int = Field(ge=1)
    end_measure: int = Field(ge=1)

    @model_validator(mode="after")
    def validate_range(self):
        if not self.label.strip() or self.end_measure < self.start_measure:
            raise ValueError("Give a label and an ordered measure range")
        return self


class SongDerivedRange(BaseModel):
    start_measure: int = Field(ge=1)
    end_measure: int = Field(ge=1)
    section: Optional[str] = None
    lyrics: list[str] = Field(default_factory=list)
    broad_harmony: list[str] = Field(default_factory=list)
    detailed_harmony: list[str] = Field(default_factory=list)
    confidence: Literal["low", "medium", "high"]
    provenance: Literal["ai"] = "ai"
    kind: Literal["section", "phrase", "transition"] = "phrase"
    repeat_group: Optional[str] = Field(default=None, max_length=80)
    annotation: Optional[str] = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def validate_range(self) -> "SongDerivedRange":
        if self.end_measure < self.start_measure:
            raise ValueError("end_measure must not precede start_measure")
        return self


class SongEnrichment(BaseModel):
    tab_fingerprint: str
    chordpro_fingerprint: Optional[str] = None
    source_sections: list[SongSourceSection] = Field(default_factory=list)
    ranges: list[SongDerivedRange] = Field(default_factory=list)
    generated_at: str


class SongShapeSource(BaseModel):
    measure_index: int = Field(ge=0)
    beat_index: int = Field(ge=0)


class SongShapePosition(BaseModel):
    string: int = Field(ge=1)
    fret: int = Field(ge=0)


class SongShapeEvent(BaseModel):
    label: Optional[str] = None
    positions: list[SongShapePosition]
    tuning: list[int]
    sources: list[SongShapeSource]


class SongStudyPayload(BaseModel):
    """Raw source of truth for a song_study artifact: the entire selected
    track loaded once from Songsterr. Basic browsing/selection/fretboard
    mapping must work from this alone. Optional enrichment is additive and
    never required."""

    song_id: int
    artist: str
    title: str
    track: SongStudyTrack
    tab_data: dict[str, Any]  # {measures, tuning, name, automations, ...} as Songsterr returned it
    shape_events: list[SongShapeEvent] = Field(default_factory=list)
    chordpro: Optional[str] = None
    enrichment: Optional[SongEnrichment] = None
    saved_ranges: list[SongSavedRange] = Field(default_factory=list, max_length=100)


class ProgressionVoicingPosition(BaseModel):
    string: int = Field(ge=1, le=6, strict=True)
    fret: int = Field(ge=0, le=36, strict=True)


class ArtifactRevision(BaseModel):
    revision: str
    payload: dict[str, Any]


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
    saved_at: Optional[str] = None
    revisions: list[ArtifactRevision] = Field(default_factory=list, exclude=True)
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


class ExerciseStep(BaseModel):
    """One timed physical event; an empty position list is an explicit rest."""
    label: str = Field(min_length=1, max_length=120)
    beats: float = Field(gt=0, le=64, allow_inf_nan=False)
    positions: list[ProgressionVoicingPosition] = Field(max_length=6)
    tuning: list[Annotated[int, Field(ge=0, le=127, strict=True)]] = Field(min_length=6, max_length=6)

    @model_validator(mode="after")
    def unique_strings(self):
        if len({p.string for p in self.positions}) != len(self.positions):
            raise ValueError("One fret per string is required")
        return self


class ExerciseDraft(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    intent: str = Field(min_length=1, max_length=500)
    tempo: int = Field(default=80, ge=30, le=240)
    steps: list[ExerciseStep] = Field(min_length=1, max_length=256)

    @model_validator(mode="after")
    def meaningful_intent(self):
        if not self.title.strip() or not self.intent.strip():
            raise ValueError("Give the drill a title and practice goal")
        return self


class ExercisePayload(ExerciseDraft):
    created_from: dict[str, Any]


class ExerciseArtifact(Artifact):
    kind: Literal["exercise"]
    payload: ExercisePayload
