"""TutorResponse contract (ticket #13): the semantic output of one stateless
tutor turn, plus exactly the observability fields the ticket's acceptance
criteria require (provider/model, latency, usage, tool-call count, terminal
status). Later tickets add their own narrowly scoped semantic fields; ticket
#21 adds `concept_suggestion` for explicit ConceptStudy promotion.

`TutorTerminal` is the schema handed to the model as its structured-output
tool (see runner.py) — kept separate from `TutorResponse` so the LLM-facing
schema never grows API-only observability fields the model has no business
producing.
"""

from typing import Literal, Optional

from pydantic import BaseModel, Field

from app.v2.models import ConceptId


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


class TutorTerminal(BaseModel):
    """The exact structured shape the model must return via tool-calling
    (see runner.py's `ToolStrategy(TutorTerminal)`). A plain conversational
    answer and a clarifying question are both just `message` text — ticket
    #13 explicitly rejects a separate paused-interrupt/clarification
    protocol."""

    message: str
    focus: Optional[TutorFocus] = None
    concept_suggestion: Optional[ConceptSuggestion] = None


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
    provider: str
    model: str
    latency_ms: int
    usage: TutorUsage
    tool_call_count: int
    status: TutorRunStatus = "completed"
