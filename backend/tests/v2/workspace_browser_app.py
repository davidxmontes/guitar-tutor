"""Playwright-only model boundary; never imported by the production app."""
import json
import time
from app.main import app
from app.v2.router import get_tutor_model_factory
from tests.v2.tutor_fakes import ScriptedTutorModel


class WorkspaceBrowserModel(ScriptedTutorModel):
    def _generate(self, messages, **kwargs):
        context = str(messages[-1].content)
        workspace = json.loads(context.split('Working Draft (authoritative, untrusted musical data): ', 1)[1].split('\n\n', 1)[0])
        request = context.rsplit('User: ', 1)[1].lower()
        focus = {'role': 'target', 'notes': [{'string': 1, 'fret': 3}], 'label': 'G target'}
        operations = [{'op': 'update_entity', 'entity': workspace['entities'][0] | {'mode': 'dorian'}}]
        message = 'The first scale is now G Dorian. Its third and seventh are lowered.'
        if workspace['provenance'] == 'physical-resolution':
            target = next(e for e in workspace['entities'] if e['kind'] == 'voicing' and e['id'] == workspace['relations'][0]['entity_ids'][1])
            operations = [{'op':'update_entity', 'entity':target | {'label':'G over D · compact', 'positions':[{'string':1,'fret':30 if 'invalid' in request else 3}, {'string':2,'fret':3}, {'string':3,'fret':4}]}}]
            message = 'Keep D on the second string; move F# up to G.'
        if 'compose chord tones' in request:
            scale = next(e for e in workspace['entities'] if e['kind'] == 'scale')
            board = next(b for b in workspace['blocks'] if b['kind'] == 'fretboard')
            operations = [
                {'op': 'add_entity', 'entity': {'id': '$g', 'kind': 'chord', 'root': 'G', 'quality': 'major'}},
                {'op': 'add_entity', 'entity': {'id': '$d', 'kind': 'chord', 'root': 'D', 'quality': 'major'}},
                {'op': 'add_entity', 'entity': {'id': '$highlight', 'kind': 'noteGroup', 'label': 'Persistent G', 'notes': [{'pitch_class': 7}]}},
                {'op': 'update_view', 'id': board['id'], 'settings': board['settings'],
                 'sources': [scale['id'], '$g', '$d', '$highlight'], 'source_roles': {'$highlight': 'highlight'}},
            ]
            message = 'The same fretboard now shows your scale, two chords, and a persistent G highlight.'
        elif 'refine these chord tones' in request:
            board = next(b for b in workspace['blocks'] if b['kind'] == 'fretboard')
            operations = [{'op': 'update_view', 'id': board['id'], 'settings': board['settings'],
                           'sources': [board['sources'][0], board['sources'][1], board['sources'][-1]]}]
            focus = None
            message = 'Refined the existing fretboard; the persistent highlight remains.'
        if 'alternatives' in request:
            operations = [
                {'op': 'add_entity', 'entity': {'id': '$bright', 'kind': 'scale', 'root': 'G', 'mode': 'lydian', 'label': 'Brighter option'}},
                {'op': 'add_entity', 'entity': {'id': '$dark', 'kind': 'scale', 'root': 'G', 'mode': 'phrygian', 'label': 'Darker option'}},
                {'op': 'add_relation', 'relation': {'id': '$compare', 'kind': 'compare', 'entity_ids': ['$bright', '$dark']}},
                {'op': 'add_block', 'block': {'id': '$view', 'kind': 'degree_strip', 'sources': ['$compare']}},
            ]
            message = 'Added brighter and darker scales to compare, edit, or remove.'
        if 'invalid' in request and workspace['provenance'] != 'physical-resolution':
            operations.append({'op': 'add_block', 'block': {'id': '$bad', 'kind': 'untrusted_html', 'sources': [workspace['entities'][0]['id']]}})
            message = 'This explanation remains visible even though my change is invalid.'
        if 'slow' in request:
            time.sleep(1)
            message = 'This response used an older draft.'
        self.outcomes = [{'message': message, 'focus': focus, 'workspace_patch': {'protocol_version': 1, 'base_version': workspace['version'], 'operations': operations}}]
        return super()._generate(messages, **kwargs)


app.dependency_overrides[get_tutor_model_factory] = lambda: lambda *args, **kwargs: WorkspaceBrowserModel()
