"""Real app/stores with only the external Tutor model boundary scripted."""
from app.main import app
from app.v2.router import get_tutor_model_factory
from tests.v2.tutor_fakes import ScriptedTutorModel


def scripted_factory(*args, **kwargs):
    return ScriptedTutorModel(outcomes=[{'message': 'Choose a degree or a neighbouring key.', 'presentation': {
        'pattern': 'hero-with-support', 'focal': 'hero', 'slots': {
            'hero': [{'kind': 'fretboard', 'config': {'labels': 'degrees'}}],
            'support': [{'kind': 'chord-palette', 'config': {'labels': 'numerals'}},
                        {'kind': 'degree-map'}, {'kind': 'circle-of-fifths'}],
        }}}])


app.dependency_overrides[get_tutor_model_factory] = lambda: scripted_factory
