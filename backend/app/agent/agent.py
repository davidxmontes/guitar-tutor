"""
Guitar Tutor LangGraph Agent.

Graph construction, public API, and shared LLM utilities.
Graph node implementations live in app.agent.nodes.
"""

import logging
import os
import re
from typing import Any, Generator, List, Optional

from dotenv import load_dotenv
from langchain_core.messages import AIMessage, HumanMessage
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command

from app.agent.nodes import (
    _build_theory_actions,
    _classify_input,
    _clarify_input,
    _execute_song_actions,
    _generate_answer,
    _plan_song_intent,
    _update_running_summary,
    _validate_highlight_groups,
)
from app.agent.schemas import OverallState
from app.config import get_settings

load_dotenv()

logger = logging.getLogger(__name__)


class ThreadNotFoundError(RuntimeError):
    """Raised when a requested thread_id does not exist in checkpoint storage."""

    def __init__(self, thread_id: str):
        super().__init__(f"THREAD_NOT_FOUND: thread '{thread_id}' has no persisted state")
        self.thread_id = thread_id


# Node names for status tracking
_NODE_FIELDS = {
    "answer": "generate_answer",
    "clarifying_question_for_user": "classify_input",
}


class GuitarTutorAgent:
    """Guitar Tutor Agent using LangGraph."""

    # Graph node methods — defined as standalone functions in nodes.py,
    # assigned here so Python binds `self` automatically when called as methods.
    _classify_input = _classify_input
    _clarify_input = _clarify_input
    _generate_answer = _generate_answer
    _plan_song_intent = _plan_song_intent
    _execute_song_actions = _execute_song_actions
    _build_theory_actions = staticmethod(_build_theory_actions)
    _validate_highlight_groups = staticmethod(_validate_highlight_groups)
    _update_running_summary = _update_running_summary

    def __init__(
        self,
        model_name: str = "gpt-4o-mini",
        temperature: float = 0,
        base_url: str | None = None,
        api_key: str | None = None,
    ):
        settings = get_settings()
        self._sqlite_conn = None
        self.memory = self._build_checkpointer(
            backend=settings.agent_checkpoint_backend,
            sqlite_path=settings.agent_checkpoint_sqlite_path,
        )
        self.model_name = model_name

        self.actions_enabled = settings.agent_actions_enabled
        self.tool_calling_enabled = settings.agent_tool_calling_enabled
        self.summary_enabled = settings.agent_summary_enabled
        self.summary_turn_interval = max(1, settings.agent_summary_turn_interval)
        self.summary_char_threshold = max(1000, settings.agent_summary_char_threshold)
        self.recent_turn_window = max(2, settings.agent_recent_turn_window)

        resolved_key = api_key or os.environ.get("OPENAI_API_KEY")
        if not resolved_key:
            raise ValueError("OPENAI_API_KEY environment variable is not set")

        llm_kwargs: dict = {"model": model_name, "temperature": temperature, "api_key": resolved_key}
        if base_url:
            llm_kwargs["base_url"] = base_url
        if settings.llm_timeout_seconds and settings.llm_timeout_seconds > 0:
            llm_kwargs["timeout"] = settings.llm_timeout_seconds

        self.llm = ChatOpenAI(**llm_kwargs)
        self.graph = self._build_graph()

    def _build_checkpointer(self, *, backend: str, sqlite_path: str):
        backend_normalized = (backend or "memory").strip().lower()
        if backend_normalized != "sqlite":
            return MemorySaver()

        try:
            import sqlite3
            from pathlib import Path
            from langgraph.checkpoint.sqlite import SqliteSaver

            db_path = Path(sqlite_path).expanduser().resolve()
            db_path.parent.mkdir(parents=True, exist_ok=True)
            self._sqlite_conn = sqlite3.connect(str(db_path), check_same_thread=False)
            logger.info("Using SQLite checkpoint backend at %s", db_path)
            return SqliteSaver(self._sqlite_conn)
        except Exception as exc:
            logger.warning("Falling back to in-memory checkpoints (SQLite unavailable): %s", exc)
            return MemorySaver()

    # --- Graph construction ---

    def _build_graph(self) -> StateGraph:
        builder = StateGraph(OverallState)

        builder.add_node("classify_input", self._classify_input)
        builder.add_node("clarify_input", self._clarify_input)
        builder.add_node("generate_answer", self._generate_answer)

        builder.add_edge(START, "classify_input")
        builder.add_edge("classify_input", "clarify_input")
        builder.add_edge("generate_answer", END)

        return builder.compile(checkpointer=self.memory)

    # --- Shared helpers ---

    def _invoke_structured(self, schema, messages: list, *, fallback: dict) -> dict:
        """Invoke structured output with error handling and fallback.

        Tries with_structured_output first (native tool/function calling).
        If that fails, falls back to a plain LLM call and parses JSON from the response text.
        """
        schema_name = getattr(schema, "__name__", str(schema))

        # Attempt 1: native structured output
        try:
            structured_llm = self.llm.with_structured_output(schema)
            result = structured_llm.invoke(messages)
            if result is None:
                logger.warning("Structured output returned None, trying JSON fallback")
            else:
                return result if isinstance(result, dict) else (
                    result.model_dump() if hasattr(result, "model_dump") else result.dict()
                )
        except Exception as e:
            logger.warning("Structured output failed (%s): %s — trying JSON fallback", schema_name, e)

        # Attempt 2: plain call + JSON extraction
        try:
            raw_response = self.llm.invoke(messages)
            raw_text = self._coerce_text(raw_response.content).strip()
            parsed = self._extract_json(raw_text)
            if parsed is not None:
                logger.info("JSON fallback succeeded for %s", schema_name)
                return parsed
            logger.warning("JSON fallback could not parse response for %s", schema_name)
        except Exception as e:
            logger.error("JSON fallback also failed (%s): %s", schema_name, e)

        return fallback

    @staticmethod
    def _extract_json(text: str) -> dict | None:
        """Extract a JSON object from LLM text that may contain markdown fences or preamble."""
        import json

        # Try the whole string first
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

        # Try extracting from markdown code fences
        fence_match = re.search(r"```(?:json)?\s*\n?(.*?)\n?```", text, re.DOTALL)
        if fence_match:
            try:
                return json.loads(fence_match.group(1).strip())
            except json.JSONDecodeError:
                pass

        # Try finding the first { ... } block
        brace_match = re.search(r"\{.*\}", text, re.DOTALL)
        if brace_match:
            try:
                return json.loads(brace_match.group(0))
            except json.JSONDecodeError:
                pass

        return None

    @staticmethod
    def _clean_answer_text(text: str) -> str:
        """Strip model-specific artifacts (e.g. minimax tool_call blocks) from answer text."""
        cleaned = re.sub(r"<minimax:tool_call>.*?</minimax:tool_call>", "", text, flags=re.DOTALL)
        # Also handle unclosed tags
        cleaned = re.sub(r"<minimax:tool_call>.*", "", cleaned, flags=re.DOTALL)
        return cleaned.strip()

    @staticmethod
    def _coerce_text(content: Any) -> str:
        """Normalize LLM response content to a plain string.
        Some models return content as a list of dicts (e.g. [{\"text\": \"...\"}])."""
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts: list[str] = []
            for item in content:
                if isinstance(item, dict) and "text" in item:
                    parts.append(str(item["text"]))
                else:
                    parts.append(str(item))
            return "".join(parts)
        return str(content)

    @staticmethod
    def _message_text(msg: Any) -> str:
        content = getattr(msg, "content", "")
        return GuitarTutorAgent._coerce_text(content)

    @staticmethod
    def _format_messages_for_prompt(messages: List[Any]) -> str:
        lines: list[str] = []
        for msg in messages:
            role = "assistant" if isinstance(msg, AIMessage) else "user"
            text = GuitarTutorAgent._message_text(msg).strip()
            if text:
                lines.append(f"{role}: {text}")
        return "\n".join(lines) if lines else "None"

    @staticmethod
    def _history_to_messages(history: List[dict]) -> list:
        messages = []
        for msg in history:
            role = msg.get("role")
            if role == "user":
                messages.append(HumanMessage(content=msg.get("content", "")))
            elif role == "assistant":
                messages.append(AIMessage(content=msg.get("content", "")))
        return messages

    def _thread_exists(self, config: dict) -> bool:
        try:
            return self.memory.get_tuple(config) is not None
        except Exception:
            # Conservative fallback if checkpointer API changes.
            snapshot = self.graph.get_state(config)
            values = getattr(snapshot, "values", None) or {}
            tasks = getattr(snapshot, "tasks", None) or []
            return bool(values) or bool(tasks)

    def _build_graph_input(
        self,
        *,
        message: str,
        thread_exists: bool,
        require_existing_thread: bool,
        bootstrap_history: Optional[List[dict]],
        ui_context: Optional[dict],
        thread_id: str,
    ) -> tuple[dict, str]:
        """Build the initial state dict for a graph invocation.

        Handles three cases:
        - restored: thread already in checkpointer, just send the new message
        - bootstrapped: new thread seeded with frontend conversation history
        - fresh: brand new thread with no prior context
        """
        if thread_exists:
            memory_status = "restored"
            messages = [HumanMessage(content=message)]
        else:
            if require_existing_thread:
                raise ThreadNotFoundError(thread_id)
            history = bootstrap_history or []
            if history:
                memory_status = "bootstrapped"
                messages = self._history_to_messages(history)
                messages.append(HumanMessage(content=message))
            else:
                memory_status = "fresh"
                messages = [HumanMessage(content=message)]

        graph_input = {
            "messages": messages,
            "ui_context": ui_context or {},
            "memory_status": memory_status,
        }
        return graph_input, memory_status

    def _check_for_interrupt(self, config: dict) -> Optional[dict]:
        state_snapshot = self.graph.get_state(config)
        if state_snapshot.tasks:
            for task in state_snapshot.tasks:
                if task.interrupts:
                    return task.interrupts[0].value
        return None

    @staticmethod
    def _extract_result(output: dict, *, memory_status: str = "fresh") -> dict:
        return {
            "interrupted": False,
            "answer": output.get("answer", ""),
            "scale": output.get("scale"),
            "chord_choices": output.get("chord_choices", []),
            "visualizations": output.get("visualizations", False),
            "out_of_scope": output.get("out_of_scope", False),
            "actions": output.get("actions", []),
            "memory_status": output.get("memory_status", memory_status),
        }

    @staticmethod
    def _identify_node(event: dict) -> str:
        """Identify which node produced this state update."""
        for field, node in _NODE_FIELDS.items():
            if event.get(field):
                return node
        return "processing"

    @staticmethod
    def _dedupe_actions(actions: list[dict]) -> list[dict]:
        deduped: list[dict] = []
        seen: set[str] = set()
        for action in actions:
            signature = repr(sorted(action.items()))
            if signature in seen:
                continue
            seen.add(signature)
            deduped.append(action)
        return deduped

    # --- Public API: synchronous ---

    def chat(
        self,
        message: str,
        conversation_history: List[dict] = None,
        thread_id: Optional[str] = "1",
        bootstrap_history: List[dict] | None = None,
        require_existing_thread: bool = False,
        ui_context: Optional[dict] = None,
    ) -> dict:
        config = {"configurable": {"thread_id": thread_id}}
        thread_exists = self._thread_exists(config)

        fallback_bootstrap = bootstrap_history if bootstrap_history else (conversation_history or [])
        graph_input, memory_status = self._build_graph_input(
            message=message,
            thread_exists=thread_exists,
            require_existing_thread=require_existing_thread,
            bootstrap_history=fallback_bootstrap,
            ui_context=ui_context,
            thread_id=str(thread_id),
        )

        output = None
        for event in self.graph.stream(graph_input, config=config, stream_mode="values"):
            output = event

        interrupt_data = self._check_for_interrupt(config)
        if interrupt_data:
            return {
                "interrupted": True,
                "interrupt_data": interrupt_data,
                "answer": "",
                "scale": None,
                "chord_choices": [],
                "visualizations": False,
                "out_of_scope": False,
                "actions": [],
                "memory_status": memory_status,
            }

        return self._extract_result(output or {}, memory_status=memory_status)

    def resume_chat(
        self,
        human_response: str,
        thread_id: Optional[str] = "1",
        ui_context: Optional[dict] = None,
    ) -> dict:
        config = {"configurable": {"thread_id": thread_id}}
        if not self._thread_exists(config):
            raise ThreadNotFoundError(str(thread_id))

        output = None
        for event in self.graph.stream(
            Command(resume={"response": human_response}),
            config=config,
            stream_mode="values",
        ):
            output = event

        # Persist freshest ui context for subsequent turns.
        if ui_context:
            self.graph.update_state(config, {"ui_context": ui_context})

        return self._extract_result(output or {}, memory_status="restored")

    def check_interrupt(self, thread_id: str = "1") -> Optional[dict]:
        config = {"configurable": {"thread_id": thread_id}}
        return self._check_for_interrupt(config)

    # --- Public API: streaming (SSE) ---

    def _iter_stream(self, graph_input, config, *, memory_status: str) -> Generator[dict, None, None]:
        """Shared streaming logic: yields status, token, interrupt, and answer events."""
        last_output = None
        in_answer_node = False
        answer_tokens_started = False

        # Dual stream: "messages" gives per-token chunks for SSE streaming,
        # "values" gives full state snapshots after each node completes.
        for mode, event in self.graph.stream(
            graph_input,
            config=config,
            stream_mode=["messages", "values"],
        ):
            if mode == "messages":
                chunk, metadata = event
                node = metadata.get("langgraph_node", "")
                has_content = chunk.content and not getattr(chunk, "tool_call_chunks", None)
                # Only yield tokens from generate_answer, and skip JSON-like chunks
                # (structured output calls emit JSON that shouldn't reach the client).
                if node == "generate_answer" and in_answer_node and has_content:
                    text = self._coerce_text(chunk.content)
                    if not answer_tokens_started:
                        stripped = text.strip()
                        if stripped.startswith("{") or stripped.startswith("["):
                            continue
                        answer_tokens_started = True
                    yield {"event": "token", "data": {"text": text}}
            elif mode == "values":
                node = self._identify_node(event)
                if node == "generate_answer":
                    in_answer_node = True
                logger.debug("Stream event from node: %s", node)
                yield {"event": "status", "data": {"node": node}}
                last_output = event

        interrupt_data = self._check_for_interrupt(config)
        if interrupt_data:
            yield {"event": "interrupt", "data": interrupt_data}
            return

        if last_output:
            payload = self._extract_result(last_output, memory_status=memory_status)
            yield {"event": "answer", "data": payload}

    def stream_chat(
        self,
        message: str,
        conversation_history: List[dict] = None,
        thread_id: Optional[str] = "1",
        bootstrap_history: List[dict] | None = None,
        require_existing_thread: bool = False,
        ui_context: Optional[dict] = None,
    ) -> Generator[dict, None, None]:
        """Stream chat processing as SSE event dicts."""
        config = {"configurable": {"thread_id": thread_id}}
        thread_exists = self._thread_exists(config)

        fallback_bootstrap = bootstrap_history if bootstrap_history else (conversation_history or [])
        graph_input, memory_status = self._build_graph_input(
            message=message,
            thread_exists=thread_exists,
            require_existing_thread=require_existing_thread,
            bootstrap_history=fallback_bootstrap,
            ui_context=ui_context,
            thread_id=str(thread_id),
        )

        yield from self._iter_stream(graph_input, config, memory_status=memory_status)

    def stream_resume(
        self,
        human_response: str,
        thread_id: Optional[str] = "1",
        ui_context: Optional[dict] = None,
    ) -> Generator[dict, None, None]:
        """Stream resume processing as SSE event dicts."""
        config = {"configurable": {"thread_id": thread_id}}
        if not self._thread_exists(config):
            raise ThreadNotFoundError(str(thread_id))

        if ui_context:
            self.graph.update_state(config, {"ui_context": ui_context})

        yield from self._iter_stream(
            Command(resume={"response": human_response}),
            config,
            memory_status="restored",
        )


# Singleton instance (lazy initialization)
_agent_instance: Optional[GuitarTutorAgent] = None


def get_agent() -> GuitarTutorAgent:
    """Get or create the singleton agent instance."""
    from app.config import get_settings

    global _agent_instance
    if _agent_instance is None:
        settings = get_settings()
        logger.info(
            "Initializing agent: provider=%s, model=%s, base_url=%s",
            settings.llm_provider,
            settings.llm_model_name,
            settings.llm_base_url,
        )
        _agent_instance = GuitarTutorAgent(
            model_name=settings.llm_model_name,
            base_url=settings.llm_base_url,
            api_key=settings.llm_api_key,
        )
    return _agent_instance
