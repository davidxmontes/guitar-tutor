"""Shared test doubles for the V2 tutor (ticket #13) — a scripted LangChain
chat model that never makes a network call. Not itself a test file (no
`test_` prefix) — imported by the test_tutor_*.py files in this directory.
"""

from typing import Any, Optional

import httpx
import openai
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from pydantic import Field


def make_forced_tool_choice_rejection() -> openai.BadRequestError:
    """Build a real `openai.BadRequestError` shaped like what some
    OpenRouter-routed models return when `create_agent`'s structured-output
    `ToolStrategy` forces `tool_choice` to a named function — some models
    only support `tool_choice="auto"` and reject anything else with a 400.
    Reproduced live against `meta/muse-spark-1.3-contributor` via
    OpenRouter; this is that exact error shape, not a guess."""

    response = httpx.Response(400, request=httpx.Request("POST", "https://openrouter.ai/api/v1/chat/completions"))
    return openai.BadRequestError(
        "Error code: 400 - {'error': {'message': 'Provider returned error', 'code': 400, 'metadata': "
        "{'raw': '{\"error\":{\"code\":null,\"message\":\"only `\\\\\"auto\\\\\"` is supported for "
        "`tool_choice`. `\\\\\"none\\\\\"`, `\\\\\"required\\\\\"`, and named function choices are not "
        "currently supported\",\"param\":\"tool_choice\",\"type\":\"invalid_request_error\"}}', "
        "'provider_name': 'Meta'}}}",
        response=response,
        body=None,
    )


class ScriptedTutorModel(BaseChatModel):
    """Records every message list it's asked to generate from and replays
    one scripted `{"message": ..., "focus": ...}` structured-output tool
    call per invocation, in order — the same pattern `create_agent`'s real
    graph expects from any tool-calling model (see runner.py). Set
    `unsupported_tools=True` to simulate a model that can't do tool calling
    at all (`bind_tools` raises `NotImplementedError`, matching what
    `TutorCapabilityError` is meant to catch). Set
    `rejects_forced_tool_choice=True` to simulate a model whose provider
    accepts tool definitions but rejects the forced/required `tool_choice`
    `create_agent` sets for structured output — a real failure mode
    reproduced against a live OpenRouter model, distinct from
    `unsupported_tools` (that one fails at `bind_tools`; this one fails at
    generate time with a 400).
    """

    outcomes: list[dict[str, Any]] = Field(default_factory=list)
    usage_metadatas: list[Optional[dict[str, Any]]] = Field(default_factory=list)
    unsupported_tools: bool = False
    rejects_forced_tool_choice: bool = False
    calls: list[list[BaseMessage]] = Field(default_factory=list)
    structured_tool_name: str = ""

    @property
    def _llm_type(self) -> str:
        return "scripted-tutor-model"

    def bind_tools(self, tools: Any, *, tool_choice: Optional[str] = None, **_kwargs: Any) -> "ScriptedTutorModel":
        del tool_choice
        if self.unsupported_tools:
            raise NotImplementedError("this scripted model has no tool-calling support")
        self.structured_tool_name = tools[-1].name
        return self

    def _generate(
        self,
        messages: list[BaseMessage],
        stop: Optional[list[str]] = None,
        run_manager: Any = None,
        **_kwargs: Any,
    ) -> ChatResult:
        del stop, run_manager
        if self.rejects_forced_tool_choice:
            raise make_forced_tool_choice_rejection()
        self.calls.append(list(messages))
        index = len(self.calls) - 1
        outcome = self.outcomes[index]
        usage = self.usage_metadatas[index] if index < len(self.usage_metadatas) else None
        message = AIMessage(
            content="",
            tool_calls=[
                {
                    "name": self.structured_tool_name,
                    "args": outcome,
                    "id": f"call-{index}",
                    "type": "tool_call",
                }
            ],
            usage_metadata=usage,
        )
        return ChatResult(generations=[ChatGeneration(message=message)])
