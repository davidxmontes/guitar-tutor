"""Turn-owned surfaces and pre-turn music, kept in the assistant message row."""
from app.v2.models import Branch, TutorMessage
from app.v2.presentation import Composition, validate_composition

MUSICAL_FIELDS = ('harmony_exploration', 'progression_workspace', 'active_workspace')


def musical_snapshot(branch: Branch) -> dict:
    return branch.model_dump(include=set(MUSICAL_FIELDS))


def starter_composition(branch: Branch) -> Composition:
    if branch.active_workspace == 'harmony':
        return validate_composition('harmony', {
            'pattern': 'hero-with-support', 'focal': 'hero', 'slots': {
                'hero': [{'kind': 'fretboard', 'subject': 'scale', 'config': {'labels': 'degrees'}}],
                'support': [{'kind': 'chord-palette'}, {'kind': 'explanation', 'subject': 'scale',
                            'config': {'text': 'Explore the scale notes and their diatonic chords.'}}],
            }})
    # P2a supplies the Progression starter when its editor lands.
    return validate_composition('progression', {
        'pattern': 'explanation-led', 'focal': 'explanation', 'slots': {
            'explanation': [{'kind': 'explanation', 'config': {'text': 'Develop an idea with your Tutor.'}}],
            'illustration': [{'kind': 'fretboard'}],
        }})


def live_composition(branch: Branch, history: list[TutorMessage]) -> Composition:
    turns = [message for message in history if message.role == 'assistant' and message.content.get('presentation')]
    selected = next((message for message in turns if message.id == branch.live_presentation_turn_id), None)
    if selected is None and turns:
        selected = turns[-1]
    if selected:
        return validate_composition(branch.active_workspace, selected.content['presentation'])
    return starter_composition(branch)
