"""
Guitar Tutor LangGraph Agent.

Graph nodes:
1. classify_input - classifies whether to proceed, clarify, or reject the user's question
2. clarify_input - handles interrupt/resume for clarifying questions
3. generate_answer - generates answer text + structured metadata/actions
"""

import logging
import os
import re
from typing import Any, Generator, List, Optional

from dotenv import load_dotenv
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, interrupt

from app.agent.parser import parse_chord_name, parse_scale_name
from app.agent.prompts import (
    ANSWER_POSTPROCESS_INSTRUCTIONS,
    ANSWER_TEXT_INSTRUCTIONS,
    CLASSIFY_INPUT_INSTRUCTIONS,
    SONG_TOOL_INTENT_INSTRUCTIONS,
    SUMMARY_INSTRUCTIONS,
)
from app.agent.schemas import (
    AnswerPostProcessSchema,
    ClassificationSchema,
    OverallState,
    SongToolPlanSchema,
)
from app.agent.song_tools import execute_song_search, resolve_measure_focus
from app.config import get_settings
from app.music.notes import get_note_at_fret
from app.music.tunings import get_tuning_notes

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

    # --- Graph nodes ---

    def _classify_input(self, state: dict) -> dict:
        messages = state.get("messages", [])
        ui_context = state.get("ui_context") or {}
        prompt_ui_context = self._project_ui_context_for_prompt(ui_context)

        running_summary, summary_turn_count = self._maybe_refresh_summary(state)

        recent_messages = messages[-(self.recent_turn_window * 2):] if messages else []
        previous_context = self._format_messages_for_prompt(recent_messages[:-1]) if len(recent_messages) > 1 else "None"
        last_question_text = self._message_text(messages[-1]) if messages else ""
        lower_question = last_question_text.lower().strip()

        # Deterministic fast-path: deictic chord-identification with strong UI context
        if self._is_context_identification_question(lower_question) and self._has_strong_ui_context(ui_context):
            return {
                "clarifying_question_for_user": None,
                "out_of_scope": False,
                "running_summary": running_summary,
                "summary_turn_count": summary_turn_count,
            }

        system_message = SystemMessage(
            content=CLASSIFY_INPUT_INSTRUCTIONS.format(
                running_summary=running_summary or "None",
                previous_context=previous_context,
                ui_context=prompt_ui_context or "None",
                user_question=last_question_text,
            )
        )

        q = self._invoke_structured(
            ClassificationSchema,
            [system_message],
            fallback={"out_of_scope": False},
        )

        logger.info("Prepared question=%s", q)

        clarifying_question_for_user = q.get("clarifying_question_for_user")
        if isinstance(clarifying_question_for_user, str) and clarifying_question_for_user.strip().lower() in {"null", "none"}:
            clarifying_question_for_user = None

        return {
            "clarifying_question_for_user": clarifying_question_for_user,
            "out_of_scope": q.get("out_of_scope", False),
            "running_summary": running_summary,
            "summary_turn_count": summary_turn_count,
        }

    def _clarify_input(self, state: dict) -> Command:
        clarifying_question_for_user = state.get("clarifying_question_for_user")

        if not clarifying_question_for_user:
            return Command(goto="generate_answer")

        human_input = interrupt(
            {
                "clarifying_question": clarifying_question_for_user,
                "action": "Please answer this question to continue",
            }
        )

        return Command(
            update={
                "messages": [HumanMessage(content=human_input.get("response", ""))],
                "clarifying_question_for_user": None,
                "out_of_scope": False,
            },
            goto="generate_answer",
        )

    def _generate_answer(self, state: dict) -> dict:
        clarifying_question_for_user = state.get("clarifying_question_for_user")
        out_of_scope = state.get("out_of_scope", False)
        running_summary = state.get("running_summary", "")
        ui_context = state.get("ui_context") or {}
        memory_status = state.get("memory_status", "fresh")

        if out_of_scope:
            refusal_msg = (
                "I only help with guitar, songs/tabs, measures, and music theory. "
                "Ask about chords, scales, fretboard shapes, progressions, songs, or tab sections."
            )
            return {
                "messages": [AIMessage(content=refusal_msg)],
                "answer": refusal_msg,
                "scale": None,
                "chord_choices": [],
                "visualizations": False,
                "out_of_scope": True,
                "actions": [],
                "memory_status": memory_status,
            }

        if clarifying_question_for_user:
            return {
                "messages": [AIMessage(content=clarifying_question_for_user)],
                "answer": clarifying_question_for_user,
                "scale": None,
                "chord_choices": [],
                "visualizations": False,
                "out_of_scope": False,
                "actions": [],
                "memory_status": memory_status,
            }

        messages = state.get("messages", [])
        user_question = self._message_text(messages[-1]) if messages else ""
        prompt_ui_context = self._project_ui_context_for_prompt(ui_context)
        song_tool_plan = self._plan_song_intent(
            user_question=user_question,
            messages=messages,
            ui_context=ui_context,
            running_summary=running_summary,
        )
        logger.info("Song tool plan=%s", song_tool_plan)
        tool_context, song_actions = self._execute_song_actions(
            user_question,
            ui_context,
            song_search_query=song_tool_plan.get("song_search_query"),
            focus_measure_number=song_tool_plan.get("focus_measure_number"),
        )

        # Call 1: Generate answer text (regular LLM — streamed via stream_mode="messages")
        text_system = SystemMessage(
            content=ANSWER_TEXT_INSTRUCTIONS.format(
                running_summary=running_summary or "None",
                ui_context=prompt_ui_context or "None",
                tool_context=tool_context or "None",
            )
        )

        # Include recent conversation history so the LLM can resolve
        # follow-up references ("this", "those chords", "show me visualizations for that")
        recent_history = messages[-(self.recent_turn_window * 2):]
        llm_messages = [text_system] + recent_history
        response = self.llm.invoke(llm_messages)
        answer_text = self._clean_answer_text(self._coerce_text(response.content))

        # Call 2: Extract metadata + fretboard highlights in one structured call
        tuning_id = ui_context.get("selected_tuning") or "standard"
        custom_notes = ui_context.get("custom_tuning_notes")
        tuning_notes = custom_notes if custom_notes else get_tuning_notes(tuning_id)

        postprocess_system = SystemMessage(
            content=ANSWER_POSTPROCESS_INSTRUCTIONS.format(
                user_question=user_question,
                answer=answer_text,
                ui_context=prompt_ui_context or "None",
                tuning_notes=tuning_notes,
            )
        )
        post = self._invoke_structured(
            AnswerPostProcessSchema,
            [postprocess_system],
            fallback={"scale": None, "chord_choices": [], "visualizations": False, "highlight_groups": []},
        )

        actions: list[dict] = []
        if self.actions_enabled:
            actions.extend(song_actions)
            actions.extend(self._build_theory_actions(post.get("scale"), post.get("chord_choices", [])))

            # Validate and add highlight groups from the combined call
            highlight_groups = self._validate_highlight_groups(post.get("highlight_groups", []))
            if highlight_groups:
                actions.append({"type": "fretboard.highlight", "groups": highlight_groups})

            actions = self._dedupe_actions(actions)

        return {
            "messages": [AIMessage(content=answer_text)],
            "answer": answer_text,
            "scale": post.get("scale"),
            "chord_choices": post.get("chord_choices", []),
            "visualizations": post.get("visualizations", False),
            "out_of_scope": False,
            "actions": actions,
            "memory_status": memory_status,
        }

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
    def _validate_highlight_groups(groups: list) -> list[dict]:
        """Validate and filter highlight groups from structured output."""
        valid_groups = []
        for g in (groups or []):
            name = g.get("name", "").strip()
            positions = [
                p for p in (g.get("positions") or [])
                if isinstance(p.get("string"), int) and isinstance(p.get("fret"), int)
                and 1 <= p["string"] <= 6 and 0 <= p["fret"] <= 22
            ]
            if name and positions:
                valid_groups.append({"name": name, "positions": positions})
        return valid_groups

    def _plan_song_intent(
        self,
        *,
        user_question: str,
        messages: list,
        ui_context: dict,
        running_summary: str,
    ) -> dict:
        """Use the answer-phase model to decide if song tools are needed."""
        prompt_ui_context = self._project_ui_context_for_prompt(ui_context)
        recent_messages = messages[-(self.recent_turn_window * 2):] if messages else []
        previous_context = self._format_messages_for_prompt(recent_messages[:-1]) if len(recent_messages) > 1 else "None"

        system_message = SystemMessage(
            content=SONG_TOOL_INTENT_INSTRUCTIONS.format(
                running_summary=running_summary or "None",
                previous_context=previous_context,
                ui_context=prompt_ui_context or "None",
                user_question=user_question,
            )
        )

        plan = self._invoke_structured(
            SongToolPlanSchema,
            [system_message],
            fallback={"song_search_query": None, "focus_measure_number": None},
        )

        song_search_query = plan.get("song_search_query")
        if isinstance(song_search_query, str):
            song_search_query = song_search_query.strip()
            if song_search_query.lower() in {"", "null", "none"}:
                song_search_query = None
        else:
            song_search_query = None

        focus_measure_number = plan.get("focus_measure_number")
        try:
            focus_measure_number = int(focus_measure_number) if focus_measure_number is not None else None
        except (TypeError, ValueError):
            focus_measure_number = None
        if focus_measure_number is not None and focus_measure_number < 1:
            focus_measure_number = None

        return {
            "song_search_query": song_search_query,
            "focus_measure_number": focus_measure_number,
        }

    def _build_theory_actions(self, scale: Optional[str], chord_choices: List[str]) -> list[dict]:
        actions: list[dict] = []

        for chord_name in chord_choices or []:
            parsed = parse_chord_name(chord_name)
            if not parsed:
                continue
            root, quality = parsed
            actions.append(
                {
                    "type": "theory.show_chord",
                    "root": root,
                    "quality": quality,
                }
            )

        if scale:
            parsed_scale = parse_scale_name(scale)
            if parsed_scale:
                root, mode = parsed_scale
                actions.append(
                    {
                        "type": "theory.show_scale",
                        "root": root,
                        "mode": mode,
                    }
                )

        return actions

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

    def _execute_song_actions(
        self,
        question_text: str,
        ui_context: dict,
        *,
        song_search_query: str | None = None,
        focus_measure_number: int | None = None,
    ) -> tuple[str, list[dict]]:
        """Run bounded Songsterr lookups for song/measure intents and return context + actions."""
        if not self.tool_calling_enabled:
            return "", []

        lower_q = question_text.strip().lower()
        search_query = song_search_query.strip() if isinstance(song_search_query, str) else None
        if search_query and search_query.lower() in {"null", "none"}:
            search_query = None

        tool_context_lines: list[str] = []
        actions: list[dict] = []

        selected_song = (ui_context or {}).get("selected_song") or {}
        selected_song_id = selected_song.get("song_id")
        selected_track_index = int((ui_context or {}).get("selected_track_index") or 0)

        # 1) Song search
        if search_query:
            ctx, acts, new_song_id, new_track = execute_song_search(search_query)
            tool_context_lines.extend(ctx)
            actions.extend(acts)
            if new_song_id is not None:
                selected_song_id = new_song_id
                selected_track_index = new_track

        # 2) Measure focus
        focus_measure_index = focus_measure_number - 1 if isinstance(focus_measure_number, int) else None

        # For deictic identification questions, trust UI beat context instead.
        if self._is_context_identification_question(lower_q):
            selected_beat = (ui_context or {}).get("selected_beat_id")
            highlighted = (ui_context or {}).get("highlighted_notes") or []
            if selected_beat:
                tool_context_lines.append(
                    f"User selected beat context: beat_id={selected_beat}, highlighted_frets={highlighted}."
                )
            focus_measure_index = None

        if focus_measure_index is not None and selected_song_id is not None:
            ctx, acts = resolve_measure_focus(
                song_id=int(selected_song_id),
                track_index=selected_track_index,
                focus_measure_index=focus_measure_index,
            )
            tool_context_lines.extend(ctx)
            actions.extend(acts)
        elif focus_measure_index is not None:
            tool_context_lines.append(
                f"User asked to focus measure {focus_measure_number}, but no song is currently selected."
            )

        return "\n".join(tool_context_lines), self._dedupe_actions(actions)

    @staticmethod
    def _project_ui_context_for_prompt(ui_context: dict) -> dict:
        """Pass only high-signal UI fields to prompts to reduce noise/token load."""
        if not ui_context:
            return {}

        allowed_keys = [
            "app_mode",
            "display_mode",
            "selected_tuning",
            "selected_scale",
            "selected_chord",
            "selected_song",
            "selected_track_index",
            "song_view_mode",
            "playhead_measure_index",
            "selected_beat_id",
            "highlighted_notes",
        ]
        projected: dict[str, Any] = {}
        for key in allowed_keys:
            if key in ui_context:
                projected[key] = ui_context.get(key)

        # Resolve highlighted fret positions to actual note names so the LLM
        # doesn't have to do fret arithmetic (which it gets wrong).
        highlighted = projected.get("highlighted_notes")
        if highlighted and isinstance(highlighted, list):
            tuning_id = ui_context.get("selected_tuning") or "standard"
            custom_notes = ui_context.get("custom_tuning_notes")
            tuning_notes = custom_notes if custom_notes else get_tuning_notes(tuning_id)

            resolved = []
            for hn in highlighted:
                string_num = hn.get("string")
                fret = hn.get("fret")
                if string_num is None or fret is None:
                    continue
                # tuning_notes is indexed 0=string1, so string_num-1
                idx = int(string_num) - 1
                if 0 <= idx < len(tuning_notes):
                    note = get_note_at_fret(tuning_notes[idx], int(fret))
                    resolved.append({**hn, "note": note})
                else:
                    resolved.append(hn)
            projected["highlighted_notes"] = resolved

        return projected

    @staticmethod
    def _is_context_identification_question(lower_question: str) -> bool:
        return any(
            phrase in lower_question
            for phrase in [
                "what chord is this",
                "which chord is this",
                "what is this chord",
                "identify this chord",
                "name this chord",
            ]
        )

    @staticmethod
    def _has_strong_ui_context(ui_context: dict) -> bool:
        if not ui_context:
            return False
        highlighted = ui_context.get("highlighted_notes") or []
        has_highlighted = isinstance(highlighted, list) and len(highlighted) >= 2
        has_selected_beat = bool(ui_context.get("selected_beat_id"))
        has_song_or_playhead = bool(ui_context.get("selected_song")) or (
            ui_context.get("playhead_measure_index") is not None
        )
        return (has_selected_beat or has_song_or_playhead) and has_highlighted

    def _maybe_refresh_summary(self, state: dict) -> tuple[str, int]:
        """Maintain a rolling summary for long threads (logical compaction)."""
        running_summary = state.get("running_summary", "") or ""
        summary_turn_count = int(state.get("summary_turn_count", 0) or 0)

        if not self.summary_enabled:
            return running_summary, summary_turn_count

        messages = state.get("messages", [])
        if not messages:
            return running_summary, summary_turn_count

        user_turns = sum(1 for m in messages if isinstance(m, HumanMessage))
        if user_turns <= 0:
            return running_summary, summary_turn_count

        message_text = "\n".join(self._message_text(m) for m in messages)
        threshold_hit = len(message_text) >= self.summary_char_threshold
        interval_hit = user_turns % self.summary_turn_interval == 0 and user_turns != summary_turn_count

        if not (threshold_hit or interval_hit):
            return running_summary, summary_turn_count

        keep_count = self.recent_turn_window * 2
        older_messages = messages[:-keep_count] if len(messages) > keep_count else []
        if not older_messages:
            return running_summary, summary_turn_count

        older_text = self._format_messages_for_prompt(older_messages)
        summary_prompt = SUMMARY_INSTRUCTIONS.format(
            running_summary=running_summary or "None",
            older_messages=older_text,
        )
        try:
            summary = self.llm.invoke([SystemMessage(content=summary_prompt)]).content
            new_summary = self._coerce_text(summary).strip()
            return new_summary, user_turns
        except Exception as exc:
            logger.warning("Summary refresh failed: %s", exc)
            return running_summary, summary_turn_count

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

        for mode, event in self.graph.stream(
            graph_input,
            config=config,
            stream_mode=["messages", "values"],
        ):
            if mode == "messages":
                chunk, metadata = event
                node = metadata.get("langgraph_node", "")
                has_content = chunk.content and not getattr(chunk, "tool_call_chunks", None)
                # Only yield tokens from generate_answer, and skip JSON-like chunks.
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
