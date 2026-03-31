"""
Graph node functions for the Guitar Tutor LangGraph agent.

Nodes:
1. classify_input - classifies whether to proceed, clarify, or reject the user's question
2. clarify_input - handles interrupt/resume for clarifying questions
3. generate_answer - generates answer text + structured metadata/actions
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any, List, Optional

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
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
    SongToolPlanSchema,
)
from app.agent.song_tools import execute_song_search, resolve_measure_focus
from app.music.notes import get_note_at_fret
from app.music.tunings import get_tuning_notes

if TYPE_CHECKING:
    from app.agent.agent import GuitarTutorAgent

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Pure helpers (no agent state needed)
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# Graph nodes (take `self` — assigned as methods on GuitarTutorAgent)
# ---------------------------------------------------------------------------


def _classify_input(self: "GuitarTutorAgent", state: dict) -> dict:
    messages = state.get("messages", [])
    ui_context = state.get("ui_context") or {}
    prompt_ui_context = _project_ui_context_for_prompt(ui_context)

    running_summary, summary_turn_count = self._update_running_summary(state)

    recent_messages = messages[-(self.recent_turn_window * 2):] if messages else []
    previous_context = self._format_messages_for_prompt(recent_messages[:-1]) if len(recent_messages) > 1 else "None"
    last_question_text = self._message_text(messages[-1]) if messages else ""
    lower_question = last_question_text.lower().strip()

    # Deterministic fast-path: deictic chord-identification with strong UI context
    if _is_context_identification_question(lower_question) and _has_strong_ui_context(ui_context):
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


def _clarify_input(self: "GuitarTutorAgent", state: dict) -> Command:
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


def _generate_answer(self: "GuitarTutorAgent", state: dict) -> dict:
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
    prompt_ui_context = _project_ui_context_for_prompt(ui_context)
    song_tool_plan = _plan_song_intent(
        self,
        user_question=user_question,
        messages=messages,
        ui_context=ui_context,
        running_summary=running_summary,
    )
    logger.info("Song tool plan=%s", song_tool_plan)
    tool_context, song_actions = _execute_song_actions(
        self,
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
        actions.extend(_build_theory_actions(post.get("scale"), post.get("chord_choices", [])))

        # Validate and add highlight groups from the combined call
        highlight_groups = _validate_highlight_groups(post.get("highlight_groups", []))
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


# ---------------------------------------------------------------------------
# Node helpers (take `self` — assigned as methods on GuitarTutorAgent)
# ---------------------------------------------------------------------------


def _plan_song_intent(
    self: "GuitarTutorAgent",
    *,
    user_question: str,
    messages: list,
    ui_context: dict,
    running_summary: str,
) -> dict:
    """Use the answer-phase model to decide if song tools are needed."""
    prompt_ui_context = _project_ui_context_for_prompt(ui_context)
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


def _build_theory_actions(scale: Optional[str], chord_choices: List[str]) -> list[dict]:
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


def _execute_song_actions(
    self: "GuitarTutorAgent",
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
    if _is_context_identification_question(lower_q):
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


def _update_running_summary(self: "GuitarTutorAgent", state: dict) -> tuple[str, int]:
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
