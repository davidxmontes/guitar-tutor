"""Turn-owned surfaces and pre-turn music, kept in the assistant message row."""
from app.v2.models import Branch, TutorMessage
from app.v2.presentation import Composition, validate_composition

MUSICAL_FIELDS = ('harmony_exploration', 'progression_workspace', 'active_workspace')


def musical_snapshot(branch: Branch) -> dict:
    return branch.model_dump(include=set(MUSICAL_FIELDS))


def starter_composition(branch: Branch) -> Composition:
    if branch.active_workspace == 'harmony':
        chord = branch.harmony_exploration and branch.harmony_exploration.focus.kind in ('chord', 'voicing')
        if not chord:
            items = [{'pattern': 'split', 'focal': 'items', 'slots': {'items': [
                {'kind': 'circle-of-fifths', 'size': 'small'},
                {'pattern': 'stack', 'focal': 'items', 'slots': {'items': [
                    {'kind': 'scale-staff'}, {'kind': 'chord-palette'}, {'kind': 'fretboard'},
                ]}},
            ]}}]
        else:
            items = [{'kind': 'voicing-explorer'},
                     {'pattern': 'split', 'focal': 'items', 'slots': {'items': [
                         {'kind': 'chord-inspector', 'size': 'small'}, {'kind': 'fretboard'},
                     ]}}]
    else:
        items = [{'pattern': 'split', 'focal': 'items', 'slots': {'items': [
            {'kind': 'progression-editor', 'size': 'small'}, {'kind': 'fretboard', 'size': 'fill'},
        ]}}]
    return validate_composition(branch.active_workspace, {
        'pattern': 'stack', 'focal': 'items', 'slots': {'items': items}})


def live_composition(branch: Branch, history: list[TutorMessage]) -> Composition:
    turns = [message for message in history if message.role == 'assistant' and message.content.get('presentation')
             and message.content.get('musical_snapshot', {}).get('active_workspace', branch.active_workspace) == branch.active_workspace]
    selected = next((message for message in turns if message.id == branch.live_presentation_turn_id), None)
    if selected:
        return validate_composition(branch.active_workspace, selected.content['presentation'])
    return starter_composition(branch)
