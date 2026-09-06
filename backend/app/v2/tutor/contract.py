"""TutorResponse contract: the semantic output of one stateless tutor turn,
plus the observability fields ticket #13 requires (provider/model, latency,
usage, tool-call count, terminal status).

Ticket #101 hard cutover: the ConceptWorkspace mutation contract
(`workspace_patch`, `workspace_result`), `concept_suggestion` (ConceptStudy
promotion), and the artifact-bound `voicing_candidates` / `exercise_suggestion`
are removed — the Branch no longer links an Artifact. The full Tutor per-turn
contract — mutation, candidates, presentation (Spec #100 §5.7) — is rebuilt in
ticket T3. What remains is a stateless message + one-turn `focus` + symbolic
progression `candidates` + physical `comparison_groups`.

`TutorTerminal` is the schema handed to the model as its structured-output
tool (see runner.py); `TutorResponse` adds the API-only observability fields.
"""

from typing import Annotated, Literal, Optional

from pydantic import BaseModel, Field, model_validator

from app.v2.models import ProgressionPayload, ProgressionVoicingPosition


class FretPosition(BaseModel):
    """One arbitrary string/fret pair — not validated against a tuning here."""

    string: int
    fret: int


class BranchFocusGroup(BaseModel):
    branch_id: str
    branch_title: str = ""
    label: str = Field(min_length=1, max_length=120)
    notes: list[ProgressionVoicingPosition] = Field(min_length=1, max_length=6)
    tuning: list[Annotated[int, Field(ge=0, le=127, strict=True)]] = Field(min_length=6, max_length=6)

    @model_validator(mode="after")
    def one_fret_per_string(self):
        if len({note.string for note in self.notes}) != len(self.notes):
            raise ValueError("A comparison shape has one fret per string")
        return self


class TutorFocus(BaseModel):
    """One-turn attention on visible notes (Tutor Attention, CONTEXT.md) —
    never persisted. `role` is a free-form semantic label."""

    role: str
    notes: list[FretPosition] = Field(default_factory=list)
    label: Optional[str] = None


class ProgressionChordIdea(BaseModel):
    """One symbolic chord in a tutor-proposed progression candidate — root +
    quality only; runner.py resolves a voicing deterministically."""

    root: str
    quality: str


class ProgressionCandidate(BaseModel):
    title: str
    chords: list[ProgressionChordIdea]


class TutorTerminal(BaseModel):
    """The exact structured shape the model must return via tool-calling
    (see runner.py's `ToolStrategy(TutorTerminal)`). A plain conversational
    answer and a clarifying question are both just `message` text."""

    message: str
    focus: Optional[TutorFocus] = None
    comparison_groups: list[BranchFocusGroup] = Field(default_factory=list, max_length=4)
    candidates: Optional[list[ProgressionCandidate]] = None


class TutorUsage(BaseModel):
    """Normalized per-run token usage (mirrors LangChain's provider-agnostic
    `usage_metadata`). A field stays `None` when a provider does not report
    that metric — never fabricated as 0."""

    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: Optional[int] = None
    cache_write_tokens: Optional[int] = None
    uncached_input_tokens: Optional[int] = None
    reasoning_tokens: Optional[int] = None


TutorRunStatus = Literal["completed"]


class TutorResponse(BaseModel):
    """Full API response for one tutor turn. A run that fails raises a typed
    exception instead (providers.TutorCapabilityError)."""

    message: str
    focus: Optional[TutorFocus] = None
    comparison_groups: list[BranchFocusGroup] = Field(default_factory=list, max_length=4)
    candidates: Optional[list[ProgressionPayload]] = None
    provider: str
    model: str
    latency_ms: int
    usage: TutorUsage
    tool_call_count: int
    status: TutorRunStatus = "completed"
