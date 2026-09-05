"""Deterministic prompt assembly for the V2 stateless tutor (ticket #13).

Ordered stable-to-volatile per the parent spec (#10): stable tutor
instructions come first, in fixed serialization, byte-identical on every
call; volatile Branch/Artifact/selection/message data always comes after.
Nothing here is a checkpointer or provider thread — `reconstruct_history`
rebuilds prior turns purely from V2's own persisted `TutorMessage` rows
(app.v2.models), and the whole assembled list is handed to a fresh
`create_agent` graph on every request (see runner.py).
"""

import json
from typing import Any, Optional

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage

from app.music.chords import CHORD_INTERVALS
from app.services.chord_service import VALID_ROOTS
from app.v2.models import Artifact, Branch, TutorMessage

_VALID_ROOTS_TEXT = ", ".join(VALID_ROOTS)
_VALID_QUALITIES_TEXT = ", ".join(sorted(CHORD_INTERVALS))

STABLE_TUTOR_INSTRUCTIONS = (
    "You are the Guitar Tutor: a single broad ReAct-style assistant helping "
    "a guitarist inside one artifact branch -- studying a song, exploring "
    "a theory concept, or creating musical ideas.\n\n"
    "Answer using the artifact/selection/focus context given below the "
    "conversation. Explanations, clarifying questions, and creative ideas "
    "are all normal conversational responses -- there is no special "
    "interrupt/resume/paused-agent protocol; if you need more information, "
    "just ask.\n\n"
    "You may direct the user's attention across views (song map, tab, "
    "chord diagrams, fretboard) by returning an optional `focus`: a named "
    "group of string/fret positions plus a short semantic `role` describing "
    "why it matters right now -- for example context, active, upcoming, "
    "candidate, target, or comparison; invent another short role word if "
    "none of those fit. Focus is attention, not navigation or layout, and "
    "arbitrary valid string/fret positions are fine even when no canonical "
    "chord or voicing entry exists for them.\n\n"
    "When a supported concept becomes a useful explicit tangent, you may "
    "offer a `concept_suggestion` with its root, concept_id, and label. A "
    "suggestion is content only: you must never open a ConceptStudy, create "
    "a branch, or imply that mentioning a concept changed navigation. The "
    "user must choose Work on this.\n\n"
    "When the user asks for a progression idea (for example 'make me "
    "something with this vibe'), respond with `candidates`: 1-3 named "
    "progression ideas inspired by the current SongStudy context. Each "
    "candidate has a `title` and an ordered `chords` list of symbolic "
    "chords -- `root` and `quality` only, never physical string/fret "
    "positions here; the application resolves an exact voicing for each "
    "chord deterministically afterward. Use one of these roots: "
    f"{_VALID_ROOTS_TEXT}. Use one of these qualities: {_VALID_QUALITIES_TEXT}. "
    "This is an exploratory request, so it returns candidates rather than "
    "mutating anything -- the user reviews, hears, and saves or explores a "
    "candidate on their own.\n\n"
    "Inside a Progression, offer `voicing_candidates` for the selected chord or "
    "transition: each has a label, zero-based chord_index, and chord with root, "
    "quality, exact voicing string/fret pairs, and tuning. Use six MIDI open-string "
    "pitches ordered string 1 (high) through 6 (low), or the legacy 'standard' id. "
    "Preserve the current tuning unless the user requests a change. You may invent "
    "unconventional physical shapes without a database entry; use cautious names "
    "when uncertain. Offer 2-3 alternatives for exploration, or one proposal for "
    "an explicit change. Never claim a proposal was applied: the user chooses Apply.\n\n"
    "When deliberate repetition would help, offer an exercise_suggestion with a title, "
    "specific practice intent, tempo, and actual ordered timed steps (label, beats, "
    "positions, tuning). Each step uses six actual MIDI open-string pitches high to low; "
    "empty positions mean a rest. Preserve source tuning. Never invent missing tab rhythm "
    "or claim a drill is saved. The user must review and explicitly save it.\n\n"
    "Respond with exactly one structured result: `message` (your answer), "
    "an optional `focus`, optional `concept_suggestion`, optional `candidates`, optional `voicing_candidates`, and optional `exercise_suggestion`."
)


def stable_system_message(provider: str) -> SystemMessage:
    """The byte-stable instructions block, always first. Anthropic gets an
    explicit `cache_control` breakpoint on this exact block (see
    providers.py's module docstring for why that has to live here, on the
    message content itself, rather than as a model-level kwarg); the other
    two providers rely on their own model-level cache-affinity key instead
    (providers.build_tutor_model), since plain ChatOpenAI has no per-block
    cache_control concept.
    """

    if provider == "anthropic":
        return SystemMessage(
            content=[
                {
                    "type": "text",
                    "text": STABLE_TUTOR_INSTRUCTIONS,
                    "cache_control": {"type": "ephemeral"},
                }
            ]
        )
    return SystemMessage(content=STABLE_TUTOR_INSTRUCTIONS)


def _selection_and_focus_text(branch: Branch) -> str:
    selection = json.dumps(branch.selection, sort_keys=True) if branch.selection else "None"
    focus = json.dumps(branch.focus, sort_keys=True) if branch.focus else "None"
    return f"Selection: {selection}\nFocus: {focus}"


def _song_study_summary(artifact: Optional[Artifact]) -> str:
    if artifact is None:
        return "Current artifact: None"
    payload = artifact.payload
    if artifact.kind == "concept_study":
        notes = ", ".join(f"{note.get('note')} ({note.get('interval')})" for note in payload.get("notes", []))
        return (
            f"Current ConceptStudy: {payload.get('display_name')}\n"
            f"Explanation: {payload.get('explanation')}\n"
            f"Notes and intervals: {notes}"
        )
    if artifact.kind == "progression":
        return "Current Progression: " + json.dumps(payload, sort_keys=True)
    if artifact.kind != "song_study":
        return f"Current artifact: {artifact.kind} — {artifact.title}"
    track = payload.get("track") or {}
    measures = (payload.get("tab_data") or {}).get("measures") or []
    return (
        f"Current SongStudy: {payload.get('artist')} - {payload.get('title')}\n"
        f"Track: {track.get('name')} ({track.get('instrument')}), tuning={track.get('tuning')}\n"
        f"Measure count: {len(measures)}"
    )


def volatile_turn_message(*, branch: Branch, artifact: Optional[Artifact], user_message: str) -> HumanMessage:
    """This turn's volatile context (current SongStudy/selection/focus) plus
    the user's new message -- always the final message in the request,
    after every reconstructed history message.
    """

    text = "\n\n".join(
        [
            _song_study_summary(artifact),
            _selection_and_focus_text(branch),
            f"User: {user_message}",
        ]
    )
    return HumanMessage(content=text)


def _render_candidates_for_history(candidates: list[dict[str, Any]]) -> str:
    """Turn a turn's persisted (already voicing-resolved) progression
    candidates back into plain text so a later turn's model can address one
    conversationally ("save the second one") -- no separate candidate-id
    protocol, same "clarification is just a message" posture as the rest of
    this module. The frontend gets the same candidates structurally, from
    `TutorMessage.content["candidates"]` directly (see router.py) -- this
    text form is for the model only.
    """

    lines = []
    for index, candidate in enumerate(candidates, start=1):
        chords = " - ".join(f"{c['root']}{c['quality']}" for c in candidate.get("chords", []))
        lines.append(f"{index}. \"{candidate.get('title')}\" -- {chords}")
    return "Progression candidates proposed this turn:\n" + "\n".join(lines)


def reconstruct_history(messages: list[TutorMessage]) -> list[BaseMessage]:
    """Rebuild the Branch's prior conversation as LangChain messages purely
    from V2's own persisted rows -- never from a checkpointer or provider
    thread. Runs on every request, including after a simulated process
    restart, since nothing here depends on in-memory state surviving.
    """

    reconstructed: list[BaseMessage] = []
    for message in messages:
        text = message.content.get("text", "")
        if message.role == "user":
            reconstructed.append(HumanMessage(content=text))
        elif message.role == "assistant":
            if message.content.get("exercise_suggestion"):
                text += "\nExercise proposed: " + json.dumps(message.content["exercise_suggestion"], sort_keys=True)
            if message.content.get("voicing_candidates"):
                text += "\nVoicing proposals: " + json.dumps(message.content["voicing_candidates"], sort_keys=True)
            candidates = message.content.get("candidates")
            if candidates:
                text = f"{text}\n\n{_render_candidates_for_history(candidates)}" if text else _render_candidates_for_history(candidates)
            reconstructed.append(AIMessage(content=text))
        else:
            reconstructed.append(
                ToolMessage(
                    content=text,
                    tool_call_id=message.content.get("tool_call_id", message.id),
                    name=message.content.get("name"),
                )
            )
    return reconstructed
