"""Deterministic progression derivation; physical motion only for assigned voices."""
from app.v2.progression_state import ProgressionIdeaDraft
from app.v2.harmony import chord_notes, chord_voicings, function_in_key
from app.v2.workspace import chromatic_note


def physical_movement(first: dict, second: dict) -> list[dict]:
    # Retained from #88's workspace resolver, without the removed entity model.
    movement = []
    for string in range(1, 7):
        before, after = [next((p for p in v['positions'] if p['string'] == string), None) for v in (first, second)]
        if before or after:
            movement.append({'string': string, 'before': before, 'after': after,
                'kind': 'added' if not before else 'removed' if not after else 'fixed' if before['fret'] == after['fret'] else 'moving',
                'semitones': after['midi'] - before['midi'] if before and after else None})
    return movement


def resolve_progression(idea: ProgressionIdeaDraft) -> dict:
    steps = []
    for step in idea.chords:
        notes = chord_notes(step)
        voicings = chord_voicings(step, idea.tuning)
        positions = voicings[0]['positions'] if voicings else []
        if step.voicing:
            by_pitch = {note['pitch_class']: note for note in notes}
            positions = []
            for position in step.voicing.positions:
                midi = idea.tuning[position.string - 1] + position.fret
                positions.append({**position.model_dump(), 'midi': midi, **by_pitch.get(midi % 12, chromatic_note(midi))})
        function = (function_in_key(step, idea.tonal_center) or 'Non-diatonic') if idea.tonal_center else None
        steps.append({**step.model_dump(), 'positions': positions, 'notes': notes, 'function': function, 'voicings': voicings})
    transitions = []
    for first, second in zip(steps, steps[1:]):
        a, b = [{note['pitch_class'] for note in step['notes']} for step in (first, second)]
        assigned = first['voicing'] is not None and second['voicing'] is not None
        transitions.append({'from_step_id': first['id'], 'to_step_id': second['id'],
            'shared': sorted(a & b), 'removed': sorted(a - b), 'added': sorted(b - a),
            'assigned': assigned, 'movement': physical_movement(first, second) if assigned else []})
    return {'steps': steps, 'transitions': transitions, 'key_status': 'Key set' if idea.tonal_center else 'Set a key'}
