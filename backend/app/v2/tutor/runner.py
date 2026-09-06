"""Stateless-per-run tutor execution (ticket #13).

`run_tutor_turn` constructs a fresh chat model and a fresh `create_agent`
graph on every call, runs it once against an explicitly assembled message
list (stable prefix + reconstructed persisted history + this turn's
context/message), and returns a `TutorResponse`. No checkpointer, no
provider thread, no agent object survives past this one call.

Ticket #101 hard cutover: the ConceptWorkspace patch path and the
artifact-linked candidate/voicing/exercise resolution are gone. Symbolic
progression `candidates` are still resolved to a deterministic voicing via
`chord_service.get_chord` (standard tuning); a chord with no curated voicing
keeps `voicing=None` — expected, not an error.
"""

import time

from typing import Any, Callable, Optional

import anthropic
import openai
from langchain.agents import create_agent
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage
from langchain_core.tools import BaseTool

from app.services.chord_service import get_chord
from app.v2.models import Branch, ProgressionChord, ProgressionPayload, ProgressionVoicingPosition, TutorMessage
from app.v2.tutor.contract import ProgressionCandidate, TutorResponse, TutorTerminal, TutorUsage
from app.v2.tutor.prompt import reconstruct_history, stable_system_message, volatile_turn_message
from app.v2.tutor.providers import TutorCapabilityError, build_tutor_model, structured_response_format, usage_from_ai_message

_VOICING_TUNING_ID = "standard"


def _resolve_candidate(candidate: ProgressionCandidate) -> ProgressionPayload:
    chords: list[ProgressionChord] = []
    for idea in candidate.chords:
        voicing: Optional[list[ProgressionVoicingPosition]] = None
        tuning: Optional[str] = None
        try:
            resolved = get_chord(idea.root, idea.quality, tuning=_VOICING_TUNING_ID)
        except (LookupError, ValueError):
            pass  # no curated voicing for this root/quality — expected, not an error
        else:
            positions = resolved.voicings[0].positions
            voicing = [ProgressionVoicingPosition(string=string, fret=min(p.fret for p in positions if p.string == string))
                       for string in sorted({p.string for p in positions})]
            tuning = _VOICING_TUNING_ID
        chords.append(ProgressionChord(root=idea.root, quality=idea.quality, voicing=voicing, tuning=tuning))
    return ProgressionPayload(title=candidate.title, chords=chords, inspired_by=None)


def _is_forced_tool_choice_rejection(exc: Exception) -> bool:
    if not isinstance(exc, (openai.BadRequestError, anthropic.BadRequestError)):
        return False
    return "tool_choice" in str(exc).lower()


ModelFactory = Callable[..., BaseChatModel]


def run_tutor_turn(
    *,
    branch: Branch,
    history: list[TutorMessage],
    user_message: str,
    provider: str,
    model: str,
    openai_api_key: Optional[str] = None,
    anthropic_api_key: Optional[str] = None,
    openrouter_api_key: Optional[str] = None,
    model_factory: ModelFactory = build_tutor_model,
    lookup_tools: Optional[list[BaseTool]] = None,
    siblings: Optional[list[dict[str, Any]]] = None,
) -> TutorResponse:
    cache_key = branch.tutor_thread_id

    chat_model = model_factory(
        provider,
        model,
        cache_key,
        openai_api_key=openai_api_key,
        anthropic_api_key=anthropic_api_key,
        openrouter_api_key=openrouter_api_key,
    )

    request_messages = [stable_system_message(provider)]
    request_messages.extend(reconstruct_history(history))
    request_messages.append(volatile_turn_message(branch=branch, user_message=user_message, siblings=siblings))

    agent = create_agent(
        model=chat_model,
        tools=lookup_tools or [],
        response_format=structured_response_format(TutorTerminal, provider, model),
    )

    started = time.monotonic()
    try:
        final_state: dict[str, Any] = agent.invoke({"messages": request_messages}, config={"recursion_limit": 16})
    except NotImplementedError as exc:
        raise TutorCapabilityError(
            f"{provider}/{model} cannot satisfy required tutor capabilities (tool calling): {exc}"
        ) from exc
    except (openai.BadRequestError, anthropic.BadRequestError) as exc:
        if not _is_forced_tool_choice_rejection(exc):
            raise
        raise TutorCapabilityError(
            f"{provider}/{model} cannot satisfy required tutor capabilities "
            f"(forced tool-choice for structured output): {exc}"
        ) from exc
    latency_ms = int((time.monotonic() - started) * 1000)

    terminal: TutorTerminal = final_state["structured_response"]

    new_messages = final_state["messages"][len(request_messages):]
    ai_messages = [m for m in new_messages if isinstance(m, AIMessage)]
    reports = [usage_from_ai_message(message) for message in ai_messages if message.usage_metadata]
    usage = TutorUsage()
    for field in TutorUsage.model_fields:
        values = [getattr(report, field) for report in reports]
        if values and all(value is not None for value in values):
            setattr(usage, field, sum(values))

    tool_call_count = sum(
        1
        for message in ai_messages
        for call in (message.tool_calls or [])
        if call.get("name") != TutorTerminal.__name__
    )

    return TutorResponse(
        message=terminal.message,
        focus=terminal.focus,
        comparison_groups=terminal.comparison_groups,
        candidates=[_resolve_candidate(c) for c in terminal.candidates] if terminal.candidates else None,
        provider=provider,
        model=model,
        latency_ms=latency_ms,
        usage=usage,
        tool_call_count=tool_call_count,
    )
