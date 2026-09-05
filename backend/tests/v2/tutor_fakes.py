"""Shared test doubles for the V2 tutor (ticket #13) — a scripted LangChain
chat model that never makes a network call. Not itself a test file (no
`test_` prefix) — imported by the test_tutor_*.py files in this directory.
"""

from typing import Any, Optional

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from pydantic import Field


class ScriptedTutorModel(BaseChatModel):
    """Records every message list it's asked to generate from and replays
    one scripted `{"message": ..., "focus": ...}` structured-output tool
    call per invocation, in order — the same pattern `create_agent`'s real
    graph expects from any tool-calling model (see runner.py). Set
    `unsupported_tools=True` to simulate a model that can't do tool calling
    at all (`bind_tools` raises `NotImplementedError`, matching what
    `TutorCapabilityError` is meant to catch).
    """

    outcomes: list[dict[str, Any]] = Field(default_factory=list)
    usage_metadatas: list[Optional[dict[str, Any]]] = Field(default_factory=list)
    unsupported_tools: bool = False
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
