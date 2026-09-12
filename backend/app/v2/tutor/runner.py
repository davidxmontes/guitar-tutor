"""Stateless-per-run tutor execution (ticket #13).

`run_tutor_turn` constructs a fresh chat model and a fresh `create_agent`
graph on every call, runs it once against an explicitly assembled message
list (stable prefix + reconstructed persisted history + this turn's
context/message), and returns a `TutorResponse`. No checkpointer, no
provider thread, no agent object survives past this one call.

"""

import time

from typing import Any, Callable, Optional

import anthropic
import openai
from langchain.agents import create_agent
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.tools import BaseTool

from app.v2.models import Branch, TutorMessage
from app.v2.tutor.contract import LearningPreferences, TutorResponse, TutorTerminal, TutorUsage
from app.v2.tutor.prompt import reconstruct_history, stable_system_message, volatile_turn_message
from app.v2.tutor.providers import TutorCapabilityError, build_tutor_model, structured_response_format, usage_from_ai_message
from app.v2.turns import live_composition, musical_snapshot
from app.v2.presentation import validate_composition
from app.v2.component_skills import component_skill_tools
from pydantic import ValidationError, TypeAdapter
from app.v2.harmony_state import HarmonyFocus, ChordRef, VoicingValue
from app.v2.harmony import chord_voicings


def apply_mutation(branch: Branch, mutation) -> Branch:
    from app.v2.harmony_actions import mutate_harmony
    updated = branch.model_copy(deep=True)
    if mutation is not None and mutation.kind != 'noop':
        if updated.active_workspace == 'progression':
            from app.v2.progression_tutor import mutate_progression
            updated.progression_workspace = mutate_progression(updated.progression_workspace, mutation)
        elif mutation.kind == 'transpose':
            from app.v2.harmony import transpose, change_subject
            updated.harmony_exploration = transpose(updated.harmony_exploration, mutation.semitones)
            if mutation.tonal_center: updated.harmony_exploration = change_subject(updated.harmony_exploration, mutation.tonal_center)
        elif mutation.kind in ('set_tonal_center', 'set_scale', 'set_tuning', 'scratch_add', 'scratch_remove', 'scratch_reorder', 'add_kept_note_group'):
            updated.harmony_exploration = mutate_harmony(updated.harmony_exploration, mutation)
        else:
            raise ValueError('Mutation outside Harmony capabilities')
    return updated


def resolve_turn_music(branch: Branch, terminal: TutorTerminal) -> Branch:
    updated = apply_mutation(branch, terminal.mutation)
    # Candidate kinds/effects are added in H2b/P3. The shell is non-mutating.
    if terminal.candidates:
        allowed = ('voicing',) if updated.active_workspace == 'harmony' else ('progression-idea', 'chord-replacement')
        if terminal.candidates.candidate_kind not in allowed:
            raise ValueError('Candidates outside active workspace')
        if terminal.candidates.candidate_kind != 'voicing':
            from app.v2.progression_tutor import resolve_candidates
            resolve_candidates(updated, terminal.candidates)
        if terminal.candidates.candidate_kind == 'voicing':
            resolved = []
            for candidate in terminal.candidates.candidates:
                if set(candidate) != {'id', 'label', 'chord', 'voicing'} or not all(isinstance(candidate[key], str) for key in ('id', 'label')):
                    raise ValueError('Voicing candidates require id, label, chord and by-value voicing')
                chord = ChordRef.model_validate(candidate['chord'])
                voicing = VoicingValue.model_validate(candidate['voicing'])
                options = chord_voicings(chord, updated.harmony_exploration.tuning)
                trusted = [VoicingValue(positions=[{'string': p['string'], 'fret': p['fret']} for p in option['positions']], tuning=option['tuning']) for option in options]
                if voicing not in trusted:
                    raise ValueError('Voicing candidate must match a resolved catalog value')
                resolved.append({'id': candidate['id'], 'label': candidate['label'], 'chord': chord.model_dump(), 'voicing': voicing.model_dump()})
            if len({item['id'] for item in resolved}) != len(resolved):
                raise ValueError('Candidate IDs must be unique')
            terminal.candidates.candidates = resolved
    if terminal.focus is not None:
        focus = terminal.focus.model_dump() if hasattr(terminal.focus, 'model_dump') else terminal.focus
        if updated.active_workspace == 'harmony':
            target = TypeAdapter(HarmonyFocus).validate_python(focus)
            if target.kind == 'voicing':
                from app.v2.harmony import resolve_harmony
                state = updated.harmony_exploration.model_copy(update={'focus': TypeAdapter(HarmonyFocus).validate_python({'kind': 'chord', 'chord': target.chord})})
                resolved = resolve_harmony(state)
                signature = {(p.string, p.fret) for p in target.voicing.positions}
                options = resolved['voicings'] + resolved['triads'] + resolved['caged_regions']
                if target.voicing.tuning != state.tuning or not any(
                    signature == {(p['string'], p['fret']) for p in option['positions']} for option in options
                ):
                    raise ValueError('Tutor Focus voicing must match a deterministic shape')
            data = updated.harmony_exploration.model_dump() | {'focus': target}
            updated.harmony_exploration = type(updated.harmony_exploration).model_validate(data)
        else:
            if not isinstance(focus, dict) or focus.get('kind') not in ('step', 'transition'):
                raise ValueError('Invalid Progression Focus')
            keys = {'kind', 'step_id'} if focus['kind'] == 'step' else {'kind', 'from_step_id', 'to_step_id'}
            if set(focus) != keys:
                raise ValueError('Invalid Progression Focus fields')
            workspace = updated.progression_workspace
            from app.v2.progression_state import ProgressionWorkspaceState
            updated.progression_workspace = ProgressionWorkspaceState.model_validate(workspace.model_dump() | {'focus': focus})

    return updated


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
    learning_preferences: LearningPreferences | None = None,
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
    request_messages.append(volatile_turn_message(branch=branch, user_message=user_message, siblings=siblings, learning_preferences=learning_preferences))

    agent = create_agent(
        model=chat_model,
        tools=[*(lookup_tools or []), *component_skill_tools(branch.active_workspace)],
        response_format=structured_response_format(TutorTerminal, provider, model),
    )

    started = time.monotonic()
    try:
        final_state: dict[str, Any] = agent.invoke({"messages": request_messages}, config={"recursion_limit": 16})
        terminal: TutorTerminal = final_state['structured_response']
        for attempt in range(2):
            try:
                updated = resolve_turn_music(branch, terminal)
                break
            except (ValueError, ValidationError):
                if attempt:
                    raise TutorCapabilityError('Tutor musical change is invalid')
                final_state = agent.invoke({'messages': final_state['messages'] + [HumanMessage(content='The musical result is invalid. Return one corrected result without derived positions in mutations.')]}, config={'recursion_limit': 16})
                terminal = final_state['structured_response']
        presentation = live_composition(branch, history)
        presentation_applied = False
        if terminal.presentation is not None:
            try:
                presentation = validate_composition(updated.active_workspace, terminal.presentation)
                presentation_applied = True
            except ValidationError:
                # Retry only presentation: retain the already validated music,
                # candidates and message, regardless of what the retry changes.
                try:
                    retry = agent.invoke({'messages': final_state['messages'] + [HumanMessage(content='The presentation is invalid. Return a corrected presentation within the workspace capabilities; retain the musical result.')]}, config={'recursion_limit': 16})
                    final_state = retry
                    presentation = validate_composition(updated.active_workspace, retry['structured_response'].presentation or {})
                    presentation_applied = True
                except Exception:
                    # Presentation is best effort after music has validated.
                    # Even a provider failure on this retry preserves that work.
                    pass
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
        mutation=terminal.mutation,
        candidates=terminal.candidates,
        attention=terminal.attention,
        presentation=presentation,
        presentation_applied=presentation_applied,
        musical_state=musical_snapshot(updated),
        provider=provider,
        model=model,
        latency_ms=latency_ms,
        usage=usage,
        tool_call_count=tool_call_count,
    )
