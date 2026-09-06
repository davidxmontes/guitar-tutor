"""Real app/stores with only the external Tutor model boundary scripted."""
from app.main import app
from app.v2.harmony import chord_voicings
from app.v2.harmony_state import ChordRef
from app.v2.router import get_tutor_model_factory
from tests.v2.tutor_fakes import ScriptedTutorModel


class WorkspaceModel(ScriptedTutorModel):
    def _generate(self, messages, **kwargs):
        if any('Offer a voicing candidate' in str(message.content) for message in messages if message.type == 'human'):
            self.outcomes = [{'message': 'Try this voicing.', 'candidates': {'candidate_kind': 'voicing', 'candidates': [
                {'id': 'v1', 'label': 'C major option', 'chord': {'root': 'C', 'quality': 'major'}, 'voicing': {'positions': [{'string': p['string'], 'fret': p['fret']} for p in chord_voicings(ChordRef(root='C', quality='major'), [64, 59, 55, 50, 45, 40])[0]['positions']], 'tuning': [64, 59, 55, 50, 45, 40]}}]},
                'presentation': {'pattern': 'hero-with-support', 'focal': 'hero', 'slots': {
                    'hero': [{'kind': 'candidate-set'}], 'support': [{'kind': 'chord-inspector'}]}}}]
        question = str(messages[-1].content)
        if 'Show scratch' in question:
            self.outcomes = [{'message': 'Arrange your scratch chords.', 'presentation': {'pattern': 'hero-with-support', 'focal': 'hero', 'slots': {'hero': [{'kind': 'scratch-sequence'}], 'support': [{'kind': 'chord-inspector'}]}}}]
        elif 'Change the key to E minor' in question:
            self.outcomes = [{'message': 'Changed to E minor.', 'mutation': {'kind': 'set_tonal_center', 'tonal_center': {'root': 'E', 'scale': 'natural_minor'}}}]
        elif 'Make it Dorian' in question:
            self.outcomes = [{'message': 'Changed to Dorian.', 'mutation': {'kind': 'set_scale', 'scale': 'dorian'}}]
        return super()._generate(messages, **kwargs)


def scripted_factory(*args, **kwargs):
    return WorkspaceModel(outcomes=[{'message': 'Choose a degree or a neighbouring key.', 'presentation': {
        'pattern': 'hero-with-support', 'focal': 'hero', 'slots': {
            'hero': [{'kind': 'fretboard', 'config': {'labels': 'degrees'}}],
            'support': [{'kind': 'chord-palette', 'config': {'labels': 'numerals'}},
                        {'kind': 'degree-map'}, {'kind': 'circle-of-fifths'}],
        }}}])


app.dependency_overrides[get_tutor_model_factory] = lambda: scripted_factory
