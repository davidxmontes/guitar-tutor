"""Real app/stores with only the external Tutor model boundary scripted."""
from app.main import app
from app.v2.router import get_tutor_model_factory
from tests.v2.tutor_fakes import ScriptedTutorModel


class WorkspaceModel(ScriptedTutorModel):
    def _generate(self, messages, **kwargs):
        if any('Offer a voicing candidate' in str(message.content) for message in messages if message.type == 'human'):
            self.outcomes = [{'message': 'Try this voicing.', 'candidates': {'candidate_kind': 'voicing', 'candidates': [
                {'id': 'v1', 'label': 'C major option', 'chord': {'root': 'C', 'quality': 'major'}, 'voicing_index': 0}]},
                'presentation': {'pattern': 'hero-with-support', 'focal': 'hero', 'slots': {
                    'hero': [{'kind': 'candidate-set'}], 'support': [{'kind': 'chord-inspector'}]}}}]
        return super()._generate(messages, **kwargs)


def scripted_factory(*args, **kwargs):
    return WorkspaceModel(outcomes=[{'message': 'Choose a degree or a neighbouring key.', 'presentation': {
        'pattern': 'hero-with-support', 'focal': 'hero', 'slots': {
            'hero': [{'kind': 'fretboard', 'config': {'labels': 'degrees'}}],
            'support': [{'kind': 'chord-palette', 'config': {'labels': 'numerals'}},
                        {'kind': 'degree-map'}, {'kind': 'circle-of-fifths'}],
        }}}])


app.dependency_overrides[get_tutor_model_factory] = lambda: scripted_factory
