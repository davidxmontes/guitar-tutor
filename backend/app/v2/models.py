"""V2 domain models — Session, Branch, Artifact, and the artifact-kind vocabulary.

Session = an ongoing exploration containing multiple branches.
Branch = one independent working context (current artifact reference,
selection, focus, recent ideas, tutor-thread identity).
Artifact = a durable musical thing (SongStudy, Progression, ConceptStudy,
Exercise) saved/reopened independently of the branch that created it —
common columns plus a JSON payload, strictly typed per concrete artifact
route. SongStudy, Progression, and ConceptStudy payloads exist so far.
"""

from typing import Annotated, Any, Literal, Optional, get_args

from pydantic import BaseModel, Field, model_validator

from app.v2.workspace import ConceptWorkspace

ArtifactKind = Literal["song_study", "progression", "concept_study", "exercise"]

ARTIFACT_KINDS: tuple[str, ...] = get_args(ArtifactKind)


class Branch(BaseModel):
    id: str
    session_id: str
    tutor_thread_id: str
    title: str = "New workspace"
    current_artifact_kind: Optional[ArtifactKind] = None
    current_artifact_id: Optional[str] = None
    working_draft: Optional[ConceptWorkspace] = None
    saved_artifact_revision: Optional[str] = None
    selection: Optional[dict[str, Any]] = None
    focus: Optional[dict[str, Any]] = None
    recent_ideas: list[dict[str, Any]] = Field(default_factory=list)
    fork_context: Optional[dict[str, Any]] = None
    closed: bool = False
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


class ProgressionChord(BaseModel):
    """Exact physical positions and high-to-low MIDI tuning; symbolic names
    may be uncertain. Legacy curated chords retain the standard tuning id."""

    root: str
    quality: str
    voicing: Optional[list[ProgressionVoicingPosition]] = None
    tuning: Optional[Literal["standard"] | Annotated[list[Annotated[int, Field(ge=0, le=127, strict=True)]], Field(min_length=6, max_length=6)]] = None

    @model_validator(mode="after")
    def validate_physical_shape(self):
        if self.voicing is not None:
            if not self.voicing or self.tuning is None:
                raise ValueError("A voicing needs sounding strings and an explicit tuning")
            if len({p.string for p in self.voicing}) != len(self.voicing):
                raise ValueError("A voicing must have only one fret per string")
        return self


class ApplyVoicingRequest(BaseModel):
    expected_updated_at: str
    chord_index: int = Field(ge=0, strict=True)
    chord: ProgressionChord

    @model_validator(mode="after")
    def require_voicing(self):
        if not self.chord.voicing:
            raise ValueError("Choose a physical voicing to apply")
        return self


class ProgressionPayload(BaseModel):
    """Progression artifact payload (ticket #14): an ordered chord sequence
    plus lightweight historical provenance. `inspired_by` never creates a
    live dependency on the source SongStudy (spec #10: "no live dependency
    propagation") — it's a snapshot dict good enough to show where the idea
    came from."""

    title: str
    chords: list[ProgressionChord]
    inspired_by: Optional[dict[str, Any]] = None


ScaleConceptId = Literal[
    "major",
    "ionian",
    "dorian",
    "phrygian",
    "lydian",
    "mixolydian",
    "aeolian",
    "natural_minor",
    "locrian",
    "harmonic_minor",
    "melodic_minor",
    "pentatonic_major",
    "pentatonic_minor",
    "blues",
]
IntervalConceptId = Literal["intervals"]
CagedConceptId = Literal["caged"]
CagedQualityId = Literal["major", "minor"]
CagedShapeId = Literal["C", "A", "G", "E", "D"]
ChordQualityId = Literal[
    "major", "minor", "diminished", "augmented", "dominant7", "major7",
    "minor7", "dim7", "m7b5", "sus2", "sus4", "add9", "madd9",
    "7sus4", "6", "m6", "9", "m9", "maj9",
]
ChordConceptId = Literal[
    "chord_major", "chord_minor", "chord_diminished", "chord_augmented",
    "chord_dominant7", "chord_major7", "chord_minor7", "chord_dim7",
    "chord_m7b5", "chord_sus2", "chord_sus4", "chord_add9",
    "chord_madd9", "chord_7sus4", "chord_6", "chord_m6", "chord_9",
    "chord_m9", "chord_maj9",
]
ConceptId = ScaleConceptId | IntervalConceptId | CagedConceptId | ChordConceptId | Literal["circle"]


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


class ConceptPayloadBase(BaseModel):
    """Concrete persisted state for one theory workspace.

    Facts and physical positions are resolved deterministically by V2. The
    tutor can teach from them, but it does not own or mutate them.
    """

    root: str
    display_name: str
    explanation: str
    created_from: Optional[dict[str, Any]] = None
    tuning: list[str]
    fret_start: int
    fret_end: int
    overlay: Literal["notes", "intervals"] = "notes"


class ScaleStudyPayload(ConceptPayloadBase):
    visualization: Literal["scale"] = "scale"
    concept_id: ScaleConceptId
    notes: list[ConceptNote]
    positions: list[ConceptPosition]
    relationships: list[ConceptRelationship]
    comparison_id: Optional[ScaleConceptId] = None


class StudyInterval(BaseModel):
    note: str
    label: str
    name: str
    semitones: int = Field(ge=0, le=11)


class IntervalStudyPayload(ConceptPayloadBase):
    visualization: Literal["interval"] = "interval"
    concept_id: IntervalConceptId = "intervals"
    selected_interval: int = Field(ge=0, le=11)
    intervals: list[StudyInterval]
    positions: list[ConceptPosition]


class ChordStudyVoicing(BaseModel):
    label: str
    name: str
    positions: list[ConceptPosition]


class ChordStudyPayload(ConceptPayloadBase):
    visualization: Literal["chord"] = "chord"
    concept_id: ChordConceptId
    quality: ChordQualityId
    notes: list[ConceptNote]
    positions: list[ConceptPosition]
    voicings: list[ChordStudyVoicing]
    selected_voicing: int = Field(ge=0)
    relationships: list[ConceptRelationship]
    comparison_quality: Optional[ChordQualityId] = None


class CagedRegion(BaseModel):
    shape: CagedShapeId
    label: str
    fret_start: int = Field(ge=0, le=22)
    fret_end: int = Field(ge=0, le=22)
    positions: list[ConceptPosition]


class CagedStudyPayload(ConceptPayloadBase):
    visualization: Literal["caged"] = "caged"
    concept_id: CagedConceptId = "caged"
    quality: CagedQualityId
    notes: list[ConceptNote]
    positions: list[ConceptPosition]
    regions: list[CagedRegion]
    selected_region: CagedShapeId
    comparison_region: Optional[CagedShapeId] = None
    overlap_positions: list[ConceptPosition] = Field(default_factory=list)


class CircleState(BaseModel):
    root: str
    selected_chord: int = Field(default=0, ge=0, le=6)
    selected_sequence: Literal["primary", "pop", "turnaround"] = "primary"
    overlay: Literal["notes", "intervals"] = "notes"


class CircleChord(BaseModel):
    numeral: str
    chord: ProgressionChord
    notes: list[ConceptNote]


class CircleSequence(BaseModel):
    id: str
    label: str
    degrees: list[int]


class CircleKey(BaseModel):
    root: str
    relative_minor: str


class CircleStudyPayload(ConceptPayloadBase):
    visualization: Literal["circle"] = "circle"
    concept_id: Literal["circle"] = "circle"
    relative_minor: str
    accidentals: list[str]
    neighbors: list[str]
    neighbor_keys: list[str]
    keys: list[CircleKey]
    chords: list[CircleChord]
    sequences: list[CircleSequence]
    selected_chord: int
    selected_sequence: str
    notes: list[ConceptNote]
    positions: list[ConceptPosition]


ConceptStudyPayload = Annotated[
    ScaleStudyPayload | IntervalStudyPayload | ChordStudyPayload | CagedStudyPayload | CircleStudyPayload,
    Field(discriminator="visualization"),
]


class StudyCatalogConcept(BaseModel):
    id: ConceptId
    display_name: str
    description: str
    visualization: Literal["scale", "interval", "chord", "caged", "circle"]


class StudyCatalogGroup(BaseModel):
    id: Literal["essentials", "explore_more", "systems"]
    display_name: str
    concepts: list[StudyCatalogConcept]


class StudyCatalog(BaseModel):
    roots: list[str]
    groups: list[StudyCatalogGroup]


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


class ConceptStudyArtifact(Artifact):
    kind: Literal["concept_study"]
    payload: ConceptStudyPayload | ConceptWorkspace


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
