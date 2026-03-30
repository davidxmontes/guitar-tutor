"""
Guitar Tutor LangGraph Agent.

Graph nodes:
1. prepare_question - normalizes and validates the user's question
2. clarify_input - handles interrupt/resume for clarifying questions
3. generate_answer - generates answer text + structured metadata/actions
"""

import logging
import os
import re
from typing import Any, Generator, List, Optional, TypedDict

from dotenv import load_dotenv
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.types import Command, interrupt
from pydantic import Field

from app.agent.parser import parse_chord_name, parse_scale_name
from app.config import get_settings
from app.models.songsterr import SongsterrRecord
from app.music.notes import get_note_at_fret
from app.music.tunings import get_tuning_notes
from app.services import songsterr

load_dotenv()

logger = logging.getLogger(__name__)


class ThreadNotFoundError(RuntimeError):
    """Raised when a requested thread_id does not exist in checkpoint storage."""

    def __init__(self, thread_id: str):
        super().__init__(f"THREAD_NOT_FOUND: thread '{thread_id}' has no persisted state")
        self.thread_id = thread_id


# --- Structured output schemas ---

class PreppedQuestionSchema(TypedDict):
    """Schema for the prepare_question node output."""

    question_for_llm: Optional[str] = Field(None, description="A concise guitar/music-theory question")
    out_of_scope: bool = Field(False, description="Whether the question is out of scope")
    clarifying_question: Optional[str] = Field(None, description="A clarifying question if needed")


class AnswerMetadataSchema(TypedDict):
    """Schema for answer metadata extraction (scale, chords, visualizations)."""

    scale: Optional[str] = Field(None, description="Most relevant scale name")
    chord_choices: List[str] = Field(default_factory=list, description="List of chord names recommended")
    visualizations: bool = Field(False, description="Whether visualizations are needed")


class OverallState(MessagesState):
    """Overall state for the agent graph."""

    question_for_llm: Optional[str] = None
    clarifying_question: Optional[str] = None
    answer: str = ""
    scale: Optional[str] = None
    chord_choices: List[str] = []
    visualizations: bool = False
    out_of_scope: bool = False

    # New context/memory fields
    ui_context: dict = {}
    running_summary: str = ""
    summary_turn_count: int = 0

    # New response fields
    actions: List[dict] = []
    memory_status: str = "fresh"


# --- Prompt templates ---

PREP_QUESTION_INSTRUCTIONS = """You are the Guitar Tutor question normalizer. You will ONLY prepare a single, concise MUSIC THEORY / GUITAR question for the NEXT node to answer — do NOT answer the question yourself.

Inputs available to you (replace in runtime):
- running_summary: {running_summary}
- previous_context: {previous_context}
- ui_context: {ui_context}
- user_question: {user_question}

Output requirements (JSON ONLY): produce exactly one of these three JSON shapes and nothing else. Use canonical chord/scale names when relevant. Keep output <= 20 words when possible.

1) Clear music/guitar question — STRONGLY PREFERRED. Use your best judgment to fill in any gaps.
{{"question_for_llm": "<<= 20 words, concise guitar/music-theory question>", "out_of_scope": false}}

2) Need clarification — LAST RESORT ONLY. Use this ONLY when you truly cannot proceed (e.g., the question is so vague that any assumption would be misleading).
{{"clarifying_question": "<one short clarifying question>", "out_of_scope": false}}

3) Out of scope
{{"out_of_scope": true}}

Best judgment guidelines:
- PREFER producing question_for_llm over asking for clarification. Make reasonable assumptions and move forward.
- Treat ui_context as a trusted runtime source of truth for current app/song/beat state whenever available.
- If details are missing in user text but present in ui_context, use ui_context and continue instead of asking clarification.
- If the user omits details like tuning, assume standard tuning unless ui_context indicates otherwise.
- If ui_context has active song/track state and user asks about "this song", keep that context.
- If user asks deictic questions like "What chord is this?" and ui_context includes selected_beat_id/highlighted_notes, keep that selected-beat context explicit.
- Do not invent or renumber measure/beat references if selected_beat_id already provides concrete context.
- If the user asks to search/find/show/display a song or tab, preserve that intent explicitly in question_for_llm (e.g., include artist/title clue).
- If the user asks to show a section or measure, preserve the requested measure reference in question_for_llm.
- Only use clarifying_question when the request is genuinely too vague to make ANY reasonable assumption.
- If the user's request is not music, guitar, songs, tabs, measures, or music theory related, return out_of_scope true.
- If you provide clarifying_question, do not provide question_for_llm.
- Do NOT include voicings, diagrams, notes, or additional metadata.
"""

ANSWER_TEXT_INSTRUCTIONS = """You are the Guitar Tutor. Answer the user's guitar/music theory question.

Hard constraints:
- ONLY answer music theory, guitar, songs, tabs, and measure-navigation related questions.
- Keep output concise: 1-3 paragraphs.

Inputs:
- Question: {user_question}
- Running summary: {running_summary}
- UI context: {ui_context}
- Tool context: {tool_context}

Behavior:
- Be clear and pedagogical. Explain WHY choices work.
- Treat ui_context as authoritative for current selection/playhead/highlighted notes when present.
- If a concrete song/tool lookup succeeded, ground your answer in those results.
- If a lookup failed, explain the limitation briefly and continue with the best fallback guidance.
- If user intent is song search/display, briefly name the matched song/artist (if known) and what the UI will show next.
- If user intent is measure/section focus, explicitly mention the measure target and any assumptions made.
- Do NOT say you lack direct tab database access. You are integrated with a song-tab lookup tool in this application.
- For deictic questions ("this chord", "this beat"), prioritize ui_context.selected_beat_id/highlighted_notes as the reference.
"""

ANSWER_METADATA_INSTRUCTIONS = """Given this guitar/music question and answer, extract structured metadata. Return ONLY the requested fields.

Question: {user_question}
Answer: {answer}

Extract:
- scale: the single most relevant scale name (e.g., "A minor pentatonic")
- chord_choices: list of chord names mentioned or recommended (e.g., ["C", "Am", "F", "G"])
- visualizations: true if the answer involves chords, scales, progressions, song tabs, or measure navigation
"""

SUMMARY_INSTRUCTIONS = """Summarize the conversation for future guitar tutoring context.

Current running summary:
{running_summary}

Older raw messages to compress:
{older_messages}

Return a concise summary under 180 words capturing:
- User goals/preferences
- Musical key/tuning/song context
- Prior recommendations and constraints
"""

# Node names for status tracking
_NODE_FIELDS = {
    "question_for_llm": "prepare_question",
    "answer": "generate_answer",
    "clarifying_question": "prepare_question",
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

        builder.add_node("prepare_question", self._prepare_question)
        builder.add_node("clarify_input", self._clarify_input)
        builder.add_node("generate_answer", self._generate_answer)

        builder.add_edge(START, "prepare_question")
        builder.add_edge("prepare_question", "clarify_input")
        builder.add_edge("generate_answer", END)

        return builder.compile(checkpointer=self.memory)

    # --- Graph nodes ---

    def _prepare_question(self, state: dict) -> dict:
        messages = state.get("messages", [])
        ui_context = state.get("ui_context") or {}
        prompt_ui_context = self._project_ui_context_for_prompt(ui_context)

        running_summary, summary_turn_count = self._maybe_refresh_summary(state)

        recent_messages = messages[-(self.recent_turn_window * 2):] if messages else []
        previous_context = self._format_messages_for_prompt(recent_messages[:-1]) if len(recent_messages) > 1 else "None"
        last_question_text = self._message_text(messages[-1]) if messages else ""
        lower_question = last_question_text.lower().strip()

        # Deterministic fast-path: when UI context is strong for deictic chord-identification,
        # avoid unnecessary clarification loops and carry concrete beat context forward.
        if self._is_context_identification_question(lower_question) and self._has_strong_ui_context(ui_context):
            selected_beat = ui_context.get("selected_beat_id")
            beat_text = f" at selected beat {selected_beat}" if selected_beat else ""
            return {
                "question_for_llm": f"Identify the chord{beat_text} using highlighted notes in current song context.",
                "clarifying_question": None,
                "out_of_scope": False,
                "running_summary": running_summary,
                "summary_turn_count": summary_turn_count,
            }

        system_message = SystemMessage(
            content=PREP_QUESTION_INSTRUCTIONS.format(
                running_summary=running_summary or "None",
                previous_context=previous_context,
                ui_context=prompt_ui_context or "None",
                user_question=last_question_text,
            )
        )

        q = self._invoke_structured(
            PreppedQuestionSchema,
            [system_message],
            fallback={"question_for_llm": last_question_text, "out_of_scope": False},
        )

        logger.info("Prepared question=%s", q)

        clarifying_question = q.get("clarifying_question")
        if isinstance(clarifying_question, str) and clarifying_question.strip().lower() in {"null", "none"}:
            clarifying_question = None

        return {
            "question_for_llm": q.get("question_for_llm"),
            "clarifying_question": clarifying_question,
            "out_of_scope": q.get("out_of_scope", False),
            "running_summary": running_summary,
            "summary_turn_count": summary_turn_count,
        }

    def _clarify_input(self, state: dict) -> Command:
        clarifying_question = state.get("clarifying_question")

        if not clarifying_question:
            return Command(goto="generate_answer")

        human_input = interrupt(
            {
                "clarifying_question": clarifying_question,
                "action": "Please answer this question to continue",
            }
        )

        return Command(
            update={
                "messages": [HumanMessage(content=human_input.get("response", ""))],
                "clarifying_question": None,
            },
            goto="prepare_question",
        )

    def _generate_answer(self, state: dict) -> dict:
        question_for_llm = state.get("question_for_llm")
        clarifying_question = state.get("clarifying_question")
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

        if clarifying_question and not question_for_llm:
            return {
                "messages": [AIMessage(content=clarifying_question)],
                "answer": clarifying_question,
                "scale": None,
                "chord_choices": [],
                "visualizations": False,
                "out_of_scope": False,
                "actions": [],
                "memory_status": memory_status,
            }

        messages = state.get("messages", [])
        question_text = question_for_llm if question_for_llm else (self._message_text(messages[-1]) if messages else "")

        tool_context, song_actions = self._run_song_tools(question_text, ui_context)
        prompt_ui_context = self._project_ui_context_for_prompt(ui_context)

        # Call 1: Generate answer text (regular LLM — streamed via stream_mode="messages")
        text_system = SystemMessage(
            content=ANSWER_TEXT_INSTRUCTIONS.format(
                user_question=question_text,
                running_summary=running_summary or "None",
                ui_context=prompt_ui_context or "None",
                tool_context=tool_context or "None",
            )
        )
        response = self.llm.invoke([text_system, HumanMessage(content=question_text)])
        answer_text = self._coerce_text(response.content)

        # Call 2: Extract metadata (structured output — quick, not streamed)
        metadata_system = SystemMessage(
            content=ANSWER_METADATA_INSTRUCTIONS.format(
                user_question=question_text,
                answer=answer_text,
            )
        )
        meta = self._invoke_structured(
            AnswerMetadataSchema,
            [metadata_system],
            fallback={"scale": None, "chord_choices": [], "visualizations": False},
        )

        actions: list[dict] = []
        if self.actions_enabled:
            actions.extend(song_actions)
            actions.extend(self._build_theory_actions(meta.get("scale"), meta.get("chord_choices", [])))
            actions = self._dedupe_actions(actions)

        return {
            "messages": [AIMessage(content=answer_text)],
            "answer": answer_text,
            "scale": meta.get("scale"),
            "chord_choices": meta.get("chord_choices", []),
            "visualizations": meta.get("visualizations", False),
            "out_of_scope": False,
            "actions": actions,
            "memory_status": memory_status,
        }

    # --- Shared helpers ---

    def _invoke_structured(self, schema, messages: list, *, fallback: dict) -> dict:
        """Invoke structured output with error handling and fallback."""
        try:
            structured_llm = self.llm.with_structured_output(schema)
            result = structured_llm.invoke(messages)
            if result is None:
                logger.warning("Structured output returned None, using fallback")
                return fallback
            return result if isinstance(result, dict) else (
                result.model_dump() if hasattr(result, "model_dump") else result.dict()
            )
        except Exception as e:
            logger.error("Structured output failed (%s): %s", getattr(schema, "__name__", str(schema)), e)
            return fallback

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

    def _run_song_tools(self, question_text: str, ui_context: dict) -> tuple[str, list[dict]]:
        """Run bounded Songsterr lookups for song/measure intents and return context + actions."""
        if not self.tool_calling_enabled:
            return "", []

        q = question_text.strip()
        lower_q = q.lower()
        search_query = self._extract_song_search_query(q)
        song_intent = (
            any(token in lower_q for token in ["song", "tab", "track", "measure", "riff", "verse", "chorus"])
            or search_query is not None
            or ("display" in lower_q and ("song" in lower_q or "tab" in lower_q))
        )
        if not song_intent:
            return "", []

        tool_context_lines: list[str] = []
        actions: list[dict] = []

        selected_song = (ui_context or {}).get("selected_song") or {}
        selected_song_id = selected_song.get("song_id")
        selected_track_index = int((ui_context or {}).get("selected_track_index") or 0)

        # 1) Optional explicit search intent
        if search_query:
            try:
                records = songsterr.search_songs_sync(search_query)
                if records:
                    actions.append({"type": "song.search", "query": search_query})
                    best, score = self._choose_best_song_match(records, search_query)
                    if best and score >= 55:
                        actions.append({"type": "song.select", "song_id": best.song_id})
                        actions.append({"type": "song.track.select", "track_index": 0})
                        selected_song_id = best.song_id
                        selected_track_index = 0
                        tool_context_lines.append(
                            f"Song search '{search_query}' matched: {best.artist} - {best.title} "
                            f"(song_id={best.song_id}, score={score})."
                        )
                    else:
                        tool_context_lines.append(
                            f"Song search '{search_query}' returned results but no confident auto-select "
                            f"(best score={score})."
                        )
                else:
                    tool_context_lines.append(f"Song search '{search_query}' returned no results.")
            except Exception as exc:
                tool_context_lines.append(f"Song search failed for '{search_query}': {exc}")

        # 2) Measure focus intent (for this song or selected search result)
        requested_measure = self._extract_measure_index(q)
        wants_measure_focus = (
            (requested_measure is not None and self._is_measure_navigation_intent(lower_q))
            or self._is_explicit_measure_navigation(lower_q)
        )

        # For deictic identification questions ("what chord is this"), trust selected UI beat context
        # and avoid expensive network measure resolution.
        if self._is_context_identification_question(lower_q):
            selected_beat = (ui_context or {}).get("selected_beat_id")
            highlighted = (ui_context or {}).get("highlighted_notes") or []
            if selected_beat:
                tool_context_lines.append(
                    f"User selected beat context: beat_id={selected_beat}, highlighted_frets={highlighted}."
                )
            wants_measure_focus = False

        if wants_measure_focus and selected_song_id is not None:
            measure_index = requested_measure if requested_measure is not None else int((ui_context or {}).get("playhead_measure_index") or 0)
            try:
                resolved_measure, resolved_beat = songsterr.resolve_measure_focus_sync(
                    song_id=int(selected_song_id),
                    track_index=selected_track_index,
                    requested_measure_index=max(0, measure_index),
                )
                action: dict[str, Any] = {
                    "type": "song.measure.focus",
                    "measure_index": resolved_measure,
                }
                if resolved_beat is not None:
                    action["beat_index"] = resolved_beat
                actions.append(action)
                tool_context_lines.append(
                    f"Resolved measure focus for song_id={selected_song_id}, track={selected_track_index}: "
                    f"measure_index={resolved_measure}, beat_index={resolved_beat}."
                )
            except Exception as exc:
                tool_context_lines.append(
                    f"Could not resolve measure focus for song_id={selected_song_id}, "
                    f"track={selected_track_index}: {exc}"
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
    def _extract_song_search_query(question: str) -> Optional[str]:
        text = question.strip()
        lower = text.lower()

        # Handle common "tabs for <song>" phrasing regardless of sentence prefix.
        generic_for_match = re.search(
            r"\b(?:tab|tabs|song|songs|track|tracks)\s+for\s+(.+)",
            lower,
        )
        if generic_for_match:
            query = generic_for_match.group(1).strip(" .,!?:;")
            if query and "measure" not in query:
                return query

        patterns = [
            r"(?:search|find|look\s*up|display|show)\s+(?:for\s+)?(?:song|songs|tab|tabs|track|tracks)\s+(.+)",
            r"(?:show|display)\s+(?:me\s+)?(?:the\s+)?tab\s+for\s+(.+)",
            r"look\s+up\s+(.+)",
        ]
        for pattern in patterns:
            match = re.match(pattern, lower)
            if not match:
                continue
            query = match.group(1).strip(" .,!?")
            if query and len(query) >= 2:
                return query

        # Quoted title fallback: "Frisky" by Dominic Fike
        quote_match = re.search(r'"([^"]+)"(?:\s+by\s+([a-z0-9 .,&\'-]+))?', lower)
        if quote_match:
            title = quote_match.group(1).strip(" .,!?:;")
            artist = (quote_match.group(2) or "").strip(" .,!?:;")
            if title and artist:
                return f"{title} {artist}"
            if title:
                return title
        return None

    @staticmethod
    def _normalize_search_text(text: str) -> str:
        lowered = text.lower().strip()
        lowered = re.sub(r"[^a-z0-9\s]", " ", lowered)
        lowered = re.sub(r"\s+", " ", lowered).strip()
        return lowered

    def _split_query_title_artist(self, query: str) -> tuple[str, str]:
        cleaned = self._normalize_search_text(query)
        if " by " in cleaned:
            title, artist = cleaned.split(" by ", 1)
            return title.strip(), artist.strip()
        return cleaned, ""

    def _score_song_match(self, record: SongsterrRecord, query: str) -> int:
        query_norm = self._normalize_search_text(query)
        title_norm = self._normalize_search_text(record.title)
        artist_norm = self._normalize_search_text(record.artist)
        combined = f"{title_norm} {artist_norm}".strip()
        q_title, q_artist = self._split_query_title_artist(query)

        score = 0

        # Strong exact/near-exact signals first.
        if query_norm == combined:
            score += 120
        if q_title and q_title == title_norm:
            score += 90
        if q_artist and q_artist == artist_norm:
            score += 80
        if q_title and title_norm.startswith(q_title):
            score += 40
        if q_artist and artist_norm.startswith(q_artist):
            score += 35

        # Token overlap fallback.
        q_tokens = set(query_norm.split())
        c_tokens = set(combined.split())
        if q_tokens and c_tokens:
            overlap = len(q_tokens & c_tokens)
            score += overlap * 8
            # Penalize extra unrelated tokens for close-title collisions.
            score -= max(0, len(c_tokens - q_tokens)) * 2

        # Small boost for exact title even if artist differs slightly.
        if q_title and title_norm == q_title:
            score += 15

        return score

    def _choose_best_song_match(
        self, records: List[SongsterrRecord], query: str
    ) -> tuple[Optional[SongsterrRecord], int]:
        if not records:
            return None, 0

        scored = [(record, self._score_song_match(record, query)) for record in records[:25]]
        scored.sort(key=lambda x: x[1], reverse=True)
        best_record, best_score = scored[0]
        return best_record, best_score

    @staticmethod
    def _extract_measure_index(question: str) -> Optional[int]:
        match = re.search(r"\bmeasure\s*#?\s*(\d+)\b", question.lower())
        if not match:
            return None

        # Users speak in 1-based measure numbers; action contract is 0-based.
        one_based = int(match.group(1))
        return max(0, one_based - 1)

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

    @staticmethod
    def _is_measure_navigation_intent(lower_question: str) -> bool:
        return any(
            token in lower_question
            for token in [
                "go to",
                "jump to",
                "navigate to",
                "move to",
                "focus",
                "show me",
                "display",
                "scroll to",
                "play from",
                "start at",
            ]
        )

    @staticmethod
    def _is_explicit_measure_navigation(lower_question: str) -> bool:
        patterns = [
            r"\b(?:go|jump|move|navigate|scroll|start|play)\s+.*\bmeasure\b",
            r"\bmeasure\s+\d+\s*(?:please|now|next)?\b",
        ]
        return any(re.search(pattern, lower_question) for pattern in patterns)

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
