"""Stateless-per-run tutor execution (ticket #13).

`run_tutor_turn` constructs a fresh chat model and a fresh `create_agent`
graph on every call, runs it exactly once against an explicitly assembled
message list (stable prefix + reconstructed persisted history + this turn's
volatile context/message), and returns a `TutorResponse`. No LangGraph
checkpointer, no provider thread, no in-memory agent object survives past
this one call -- see prompt.py for message assembly and providers.py for
per-provider model construction/caching.

Ticket #14 adds progression-candidate resolution: the model only ever
proposes symbolic chords (`ProgressionChordIdea`); `_resolve_candidate`
below is the deterministic backend step that looks up an exact voicing via
`chord_service.get_chord` (standard tuning) for each chord, producing the
resolved `ProgressionPayload` candidates on `TutorResponse`. A chord with no
curated voicing simply keeps `voicing=None` -- expected, not an error.
"""

import time
from typing import Any, Callable, Optional

import anthropic
import openai
from langchain.agents import create_agent
from langchain.agents.structured_output import ProviderStrategy, ToolStrategy
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage
from pydantic import create_model

from app.services.chord_service import get_chord
from app.v2.models import Artifact, Branch, ProgressionChord, ProgressionPayload, ProgressionVoicingPosition, TutorMessage
from app.v2.tutor.contract import ProgressionCandidate, TutorFocus, TutorResponse, TutorTerminal, TutorUsage
from app.v2.tutor.prompt import reconstruct_history, stable_system_message, volatile_turn_message
from app.v2.tutor.providers import TutorCapabilityError, build_tutor_model, usage_from_ai_message

# (provider, model) pairs known to accept tool definitions but reject a
# forced/named tool_choice -- ToolStrategy always forces one, so these need
# ProviderStrategy's native structured-output mode instead. Real fix for a
# known model, not a workaround: OpenRouter's Meta endpoint for
# meta/muse-spark-1.3-contributor only permits tool_choice="auto".
_FORCED_TOOL_CHOICE_INCOMPATIBLE: frozenset[tuple[str, str]] = frozenset(
    {("openrouter", "meta/muse-spark-1.3-contributor")}
)


def _response_format(provider: str, model: str) -> ToolStrategy | ProviderStrategy:
    if (provider, model) not in _FORCED_TOOL_CHOICE_INCOMPATIBLE:
        return ToolStrategy(TutorTerminal)
    # Strict native JSON schema requires every property in `required`;
    # Optional[...] = None fields are otherwise omittable, which strict mode
    # rejects. Redeclare them as required-but-nullable (same type, no
    # default) rather than loosening TutorTerminal itself for every model.
    strict_schema = create_model(
        TutorTerminal.__name__,
        __base__=TutorTerminal,
        focus=(Optional[TutorFocus], ...),
        candidates=(Optional[list[ProgressionCandidate]], ...),
    )
    return ProviderStrategy(strict_schema)

_VOICING_TUNING_ID = "standard"


def _inspired_by(branch: Branch, artifact: Optional[Artifact]) -> Optional[dict[str, Any]]:
    """Lightweight, no-live-dependency provenance (spec #10) -- a snapshot,
    never a reference the source SongStudy could later invalidate."""

    if artifact is None:
        return None
    info: dict[str, Any] = {
        "artifact_id": artifact.id,
        "artifact_kind": artifact.kind,
        "artifact_title": artifact.title,
    }
    if branch.selection:
        info["selection"] = branch.selection
    return info


def _resolve_candidate(
    candidate: ProgressionCandidate,
    *,
    branch: Branch,
    artifact: Optional[Artifact],
) -> ProgressionPayload:
    chords: list[ProgressionChord] = []
    for idea in candidate.chords:
        voicing: Optional[list[ProgressionVoicingPosition]] = None
        tuning: Optional[str] = None
        try:
            resolved = get_chord(idea.root, idea.quality, tuning=_VOICING_TUNING_ID)
        except (LookupError, ValueError):
            pass  # no curated voicing for this root/quality -- expected, not an error
        else:
            voicing = [ProgressionVoicingPosition(string=p.string, fret=p.fret) for p in resolved.voicings[0].positions]
            tuning = _VOICING_TUNING_ID
        chords.append(ProgressionChord(root=idea.root, quality=idea.quality, voicing=voicing, tuning=tuning))
    return ProgressionPayload(title=candidate.title, chords=chords, inspired_by=_inspired_by(branch, artifact))

def _is_forced_tool_choice_rejection(exc: Exception) -> bool:
    """True when a provider rejected the request specifically because it
    can't honor a forced/required `tool_choice` -- `create_agent`'s
    structured-output `ToolStrategy` always sets one, but some
    OpenRouter-routed models only support `tool_choice="auto"` and 400 on
    anything else (reproduced live against `meta/muse-spark-1.3-contributor`).
    Narrowed to this specific signal, rather than treating every 400 as a
    capability failure, so an unrelated bad-request bug doesn't get
    silently relabeled as "this model can't do tool calling"."""

    if not isinstance(exc, (openai.BadRequestError, anthropic.BadRequestError)):
        return False
    return "tool_choice" in str(exc).lower()


ModelFactory = Callable[..., BaseChatModel]


def run_tutor_turn(
    *,
    branch: Branch,
    artifact: Optional[Artifact],
    history: list[TutorMessage],
    user_message: str,
    provider: str,
    model: str,
    openai_api_key: Optional[str] = None,
    anthropic_api_key: Optional[str] = None,
    openrouter_api_key: Optional[str] = None,
    model_factory: ModelFactory = build_tutor_model,
) -> TutorResponse:
    # Cache-affinity key derived from application state (never itself
    # conversation memory) -- see providers.py.
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
    request_messages.append(volatile_turn_message(branch=branch, artifact=artifact, user_message=user_message))

    agent = create_agent(model=chat_model, tools=[], response_format=_response_format(provider, model))

    started = time.monotonic()
    try:
        final_state: dict[str, Any] = agent.invoke({"messages": request_messages})
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

    new_messages = final_state["messages"][len(request_messages) :]
    ai_messages = [m for m in new_messages if isinstance(m, AIMessage)]
    usage_source = next((m for m in reversed(ai_messages) if m.usage_metadata), None)
    usage = usage_from_ai_message(usage_source) if usage_source is not None else TutorUsage()

    # Every AIMessage.tool_calls entry that isn't the structured-response
    # tool itself is a real domain tool call (ticket #13 ships with zero
    # domain tools, so this is 0 today -- the counting logic stays correct
    # once #14/#16/#20 add real tools).
    tool_call_count = sum(
        1
        for message in ai_messages
        for call in (message.tool_calls or [])
        if call.get("name") != TutorTerminal.__name__
    )

    resolved_candidates = (
        [_resolve_candidate(c, branch=branch, artifact=artifact) for c in terminal.candidates]
        if terminal.candidates
        else None
    )

    return TutorResponse(
        message=terminal.message,
        focus=terminal.focus,
        concept_suggestion=terminal.concept_suggestion,
        candidates=resolved_candidates,
        provider=provider,
        model=model,
        latency_ms=latency_ms,
        usage=usage,
        tool_call_count=tool_call_count,
    )
