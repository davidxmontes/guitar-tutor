from typing import Annotated, Literal, Optional

from pydantic import BaseModel, Field, model_validator

from app.v2.models import ProgressionVoicingPosition
from app.v2.workspace import StrictModel
from app.v2.harmony_state import HarmonyFocus
from app.v2.presentation import Composition


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


class TutorAttention(BaseModel):
    """One-turn attention on visible notes (Tutor Attention, CONTEXT.md) —
    never persisted. `role` is a free-form semantic label."""

    role: str
    notes: list[FretPosition] = Field(default_factory=list)
    label: Optional[str] = None


from app.v2.harmony_actions import HarmonyMutation as TutorMutation


class CandidateSet(StrictModel):
    candidate_kind: Literal['voicing', 'progression-idea', 'chord-replacement']
    candidates: list[dict] = Field(default_factory=list)


class TutorTerminal(StrictModel):
    message: str
    mutation: Optional[TutorMutation] = None
    candidates: Optional[CandidateSet] = None
    focus: Optional[HarmonyFocus | dict] = None
    attention: Optional[TutorAttention] = None
    # Deliberately raw until the separate presentation layer validates it.
    # A bad layout must never prevent a valid musical result from being read.
    presentation: Optional[dict] = None
    comparison_groups: list[BranchFocusGroup] = Field(default_factory=list, max_length=4)


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
    mutation: Optional[TutorMutation] = None
    candidates: Optional[CandidateSet] = None
    focus: Optional[HarmonyFocus | dict] = None
    attention: Optional[TutorAttention] = None
    presentation: Optional[Composition] = None
    presentation_applied: bool = False
    comparison_groups: list[BranchFocusGroup] = Field(default_factory=list, max_length=4)
    musical_state: Optional[dict] = Field(default=None, exclude=True)
    branch: Optional[dict] = None
    provider: str
    model: str
    latency_ms: int
    usage: TutorUsage
    tool_call_count: int
    status: TutorRunStatus = "completed"
