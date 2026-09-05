"""Stateless-per-run tutor execution (ticket #13).

`run_tutor_turn` constructs a fresh chat model and a fresh `create_agent`
graph on every call, runs it exactly once against an explicitly assembled
message list (stable prefix + reconstructed persisted history + this turn's
volatile context/message), and returns a `TutorResponse`. No LangGraph
checkpointer, no provider thread, no in-memory agent object survives past
this one call -- see prompt.py for message assembly and providers.py for
per-provider model construction/caching.
"""

import time
from typing import Any, Callable, Optional

from langchain.agents import create_agent
from langchain.agents.structured_output import ToolStrategy
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage

from app.v2.models import Artifact, Branch, TutorMessage
from app.v2.tutor.contract import TutorResponse, TutorTerminal, TutorUsage
from app.v2.tutor.prompt import reconstruct_history, stable_system_message, volatile_turn_message
from app.v2.tutor.providers import TutorCapabilityError, build_tutor_model, usage_from_ai_message

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

    agent = create_agent(model=chat_model, tools=[], response_format=ToolStrategy(TutorTerminal))

    started = time.monotonic()
    try:
        final_state: dict[str, Any] = agent.invoke({"messages": request_messages})
    except NotImplementedError as exc:
        raise TutorCapabilityError(
            f"{provider}/{model} cannot satisfy required tutor capabilities (tool calling): {exc}"
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

    return TutorResponse(
        message=terminal.message,
        focus=terminal.focus,
        provider=provider,
        model=model,
        latency_ms=latency_ms,
        usage=usage,
        tool_call_count=tool_call_count,
    )
