"""TutorResponse contract (ticket #13): the semantic output of one stateless
tutor turn, plus exactly the observability fields the ticket's acceptance
criteria require (provider/model, latency, usage, tool-call count, terminal
status). Progression candidates are ticket #14; Ticket #16 adds physical voicing proposals bound to the loaded artifact revision.
Exercise suggestions remain scoped to #20. Ticket #21 adds
`concept_suggestion` for explicit ConceptStudy promotion.

`TutorTerminal` is the schema handed to the model as its structured-output
tool (see runner.py) — kept separate from `TutorResponse` so the LLM-facing
schema never grows API-only observability fields the model has no business
producing. `TutorTerminal.candidates` carries only symbolic chord ideas
(root/quality) the model proposed; runner.py resolves each into a full
`ProgressionPayload` (with a resolved voicing where chord_service has one)
before it reaches `TutorResponse.candidates`.
"""

from typing import Literal, Optional

from pydantic import BaseModel, Field

from app.v2.models import ConceptId, ProgressionPayload, ProgressionChord


class FretPosition(BaseModel):
    """One arbitrary string/fret pair. Deliberately not validated against a
    tuning/fret-count here — the tutor may invent positions with no
    canonical chord/voicing entry (spec #10); physical/structural validation
    belongs to the Artifact API mutation path (#16/#20), not tutor output."""

    string: int
    fret: int


class TutorFocus(BaseModel):
    """Cross-view attention, not navigation (spec #10's "the user owns
    navigation; the tutor owns attention"). `role` is a free-form semantic
    label — the spec names context/active/upcoming/candidate/target/
    comparison as its starting vocabulary but explicitly leaves room for
    more, so this stays a plain string rather than a closed enum."""

    role: str
    notes: list[FretPosition] = Field(default_factory=list)
    label: Optional[str] = None


class ConceptSuggestion(BaseModel):
    """A concept the tutor mentioned that the UI may offer to open.

    This is content, not navigation: only a later explicit user action may
    create the ConceptStudy branch.
    """

    concept_id: ConceptId
    root: str
    label: str


class ProgressionChordIdea(BaseModel):
    """One symbolic chord in a tutor-proposed progression candidate (ticket
    #14) — root + quality only. The tutor never invents physical string/fret
    positions for a progression candidate here (arbitrary creative voicings
    are ticket #16's job); runner.py resolves each idea's voicing
    deterministically via chord_service after the model responds."""

    root: str
    quality: str


class ProgressionCandidate(BaseModel):
    """A tutor-proposed progression candidate (ticket #14), tied to the
    current SongStudy context — symbolic chords only, exactly as the model
    proposed them. Session state until saved/dismissed; not itself a
    durable Artifact (see runner.py for voicing resolution into the
    response's resolved `ProgressionPayload` candidates, and router.py's
    save endpoint for persistence)."""

    title: str
    chords: list[ProgressionChordIdea]


class VoicingCandidate(BaseModel):
    label: str
    chord_index: int = Field(ge=0)
    chord: ProgressionChord


class VoicingProposal(VoicingCandidate):
    artifact_id: str
    expected_updated_at: str


class TutorTerminal(BaseModel):
    """The exact structured shape the model must return via tool-calling
    (see runner.py's `ToolStrategy(TutorTerminal)`). A plain conversational
    answer and a clarifying question are both just `message` text — ticket
    #13 explicitly rejects a separate paused-interrupt/clarification
    protocol."""

    message: str
    focus: Optional[TutorFocus] = None
    concept_suggestion: Optional[ConceptSuggestion] = None
    candidates: Optional[list[ProgressionCandidate]] = None
    voicing_candidates: Optional[list[VoicingCandidate]] = None


class TutorUsage(BaseModel):
    """Normalized per-run token usage (mirrors the shape LangChain's own
    provider-agnostic `usage_metadata` already gives us — see
    app.v2.tutor.providers.usage_from_ai_message). A field stays `None` when
    a provider does not report that metric at all — never fabricated as 0.
    OpenAI/OpenRouter never report `cache_write_tokens`; only Anthropic
    does.
    """

    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: Optional[int] = None
    cache_write_tokens: Optional[int] = None
    uncached_input_tokens: Optional[int] = None
    reasoning_tokens: Optional[int] = None


TutorRunStatus = Literal["completed"]


class TutorResponse(BaseModel):
    """Full API response for one tutor turn: the semantic `TutorTerminal`
    output plus exactly the observability ticket #13 requires. A run that
    fails (capability/provider error) never reaches this shape — it raises
    a typed exception instead (see providers.TutorCapabilityError) so the
    API layer can fail clearly rather than returning a half-successful
    response."""

    message: str
    focus: Optional[TutorFocus] = None
    concept_suggestion: Optional[ConceptSuggestion] = None
    candidates: Optional[list[ProgressionPayload]] = None
    voicing_candidates: Optional[list[VoicingProposal]] = None
    provider: str
    model: str
    latency_ms: int
    usage: TutorUsage
    tool_call_count: int
    status: TutorRunStatus = "completed"
