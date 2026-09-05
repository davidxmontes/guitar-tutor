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


class SongDerivedRange(BaseModel):
    start_measure: int = Field(ge=1)
    end_measure: int = Field(ge=1)
    section: Optional[str] = None
    lyrics: list[str] = Field(default_factory=list)
    broad_harmony: list[str] = Field(default_factory=list)
    detailed_harmony: list[str] = Field(default_factory=list)
    confidence: Literal["low", "medium", "high"]
    provenance: Literal["ai"] = "ai"

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
    chordpro: Optional[str] = None
    enrichment: Optional[SongEnrichment] = None


class ProgressionVoicingPosition(BaseModel):
    """One string/fret position within a saved chord's exact voicing —
    deliberately just string+fret (no note/interval labels): those are
    derivable, and the physical position + tuning below are what the spec
    calls authoritative for reproducing a chosen voicing."""

    string: int
    fret: int


class ProgressionChord(BaseModel):
    """One chord slot in a Progression: symbolic identity (root/quality) is
    always present; `voicing`/`tuning` are populated only when
    chord_service.get_chord found a curated voicing for this root/quality
    (see app.v2.tutor.runner) — no entry is expected and normal, not an
    error (spec #10: don't require every chord to exist in a canonical DB
    before it can be displayed/saved)."""

    root: str
    quality: str
    voicing: Optional[list[ProgressionVoicingPosition]] = None
    tuning: Optional[str] = None  # tuning id (e.g. "standard") the voicing was resolved against


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
ConceptId = ScaleConceptId | IntervalConceptId | ChordConceptId


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


ConceptStudyPayload = Annotated[ScaleStudyPayload | IntervalStudyPayload | ChordStudyPayload, Field(discriminator="visualization")]


class StudyCatalogConcept(BaseModel):
    id: ConceptId
    display_name: str
    description: str
    visualization: Literal["scale", "interval", "chord"]


class StudyCatalogGroup(BaseModel):
    id: Literal["essentials", "explore_more", "systems"]
    display_name: str
    concepts: list[StudyCatalogConcept]


class StudyCatalog(BaseModel):
    roots: list[str]
    groups: list[StudyCatalogGroup]


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


class ConceptStudyArtifact(Artifact):
    kind: Literal["concept_study"]
    payload: ConceptStudyPayload


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
