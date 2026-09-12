"""Turn-owned surfaces and pre-turn music, kept in the assistant message row."""
from app.v2.models import Branch, TutorMessage
from app.v2.presentation import Composition, validate_composition

MUSICAL_FIELDS = ('harmony_exploration', 'progression_workspace', 'active_workspace')


def musical_snapshot(branch: Branch) -> dict:
    return branch.model_dump(include=set(MUSICAL_FIELDS))


def starter_composition(branch: Branch) -> Composition:
    if branch.active_workspace == 'harmony':
        if branch.harmony_exploration and branch.harmony_exploration.focus.kind in ('chord', 'voicing'):
            return validate_composition('harmony', {
                'pattern': 'hero-with-support', 'focal': 'hero', 'slots': {
                    'hero': [{'kind': 'voicing-explorer', 'subject': 'focus', 'config': {'view': 'list'}}],
                    'support': [{'kind': 'chord-inspector', 'subject': 'focus'}, {'kind': 'fretboard', 'subject': 'focus'}],
                }})
        return validate_composition('harmony', {
            'pattern': 'hero-with-support', 'focal': 'hero', 'slots': {
                'hero': [{'kind': 'fretboard', 'subject': 'scale', 'config': {'labels': 'degrees'}}],
                'support': [{'kind': 'chord-palette'}, {'kind': 'explanation', 'subject': 'scale',
                            'config': {'text': 'Explore the scale notes and their diatonic chords.'}}],
            }})
    return validate_composition('progression', {
        'pattern': 'hero-with-support', 'focal': 'hero', 'slots': {
            'hero': [{'kind': 'fretboard'}],
            'support': [{'kind': 'progression-editor', 'config': {'beats_per_bar': 4}}, {'kind': 'progression-idea-list'}],
        }})


def live_composition(branch: Branch, history: list[TutorMessage]) -> Composition:
    turns = [message for message in history if message.role == 'assistant' and message.content.get('presentation')
             and message.content.get('musical_snapshot', {}).get('active_workspace', branch.active_workspace) == branch.active_workspace]
    selected = next((message for message in turns if message.id == branch.live_presentation_turn_id), None)
    if selected:
        return validate_composition(branch.active_workspace, selected.content['presentation'])
    return starter_composition(branch)
