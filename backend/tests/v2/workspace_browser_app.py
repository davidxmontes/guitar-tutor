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
        request = context.rsplit('User: ', 1)[1]
        operations = [{'op': 'update_entity', 'entity': workspace['entities'][0] | {'mode': 'dorian'}}]
        message = 'The first scale is now G Dorian. Its third and seventh are lowered.'
        if 'alternatives' in request:
            operations = [
                {'op': 'add_entity', 'entity': {'id': '$bright', 'root': 'G', 'mode': 'lydian', 'label': 'Brighter option'}},
                {'op': 'add_entity', 'entity': {'id': '$dark', 'root': 'G', 'mode': 'phrygian', 'label': 'Darker option'}},
                {'op': 'add_relation', 'relation': {'id': '$compare', 'entity_ids': ['$bright', '$dark']}},
                {'op': 'add_block', 'block': {'id': '$view', 'kind': 'degree_strip', 'source_id': '$compare'}},
            ]
            message = 'Added brighter and darker scales to compare, edit, or remove.'
        if 'invalid' in request:
            operations.append({'op': 'add_block', 'block': {'id': '$bad', 'kind': 'untrusted_html', 'source_id': workspace['entities'][0]['id']}})
            message = 'This explanation remains visible even though my change is invalid.'
        if 'slow' in request:
            time.sleep(1)
            message = 'This response used an older draft.'
        self.outcomes = [{'message': message, 'focus': {'role':'target', 'notes':[{'string':1,'fret':3}], 'label':'G target'}, 'workspace_patch': {'protocol_version': 1, 'base_version': workspace['version'], 'operations': operations}}]
        return super()._generate(messages, **kwargs)


app.dependency_overrides[get_tutor_model_factory] = lambda: lambda *args, **kwargs: WorkspaceBrowserModel()
