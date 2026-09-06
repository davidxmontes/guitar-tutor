from copy import deepcopy
from tests.v2.test_router import client  # noqa: F401


def test_update_view_validates_sources_and_preserves_input(client):
    sid = client.post('/api/v2/sessions').json()['id']
    workspace = client.post(f'/api/v2/sessions/{sid}/concept-workspaces', json={'recipe': 'scale-comparison'}).json()['working_draft']
    before = deepcopy(workspace)
    block = workspace['blocks'][0]
    sources = [entity['id'] for entity in workspace['entities']]
    view = {'op': 'update_view', 'id': block['id'], 'settings': block['settings'], 'sources': sources[::-1]}
    response = client.post('/api/v2/concept-workspaces/update-view', json={'workspace': workspace, 'view': view})
    assert response.status_code == 200
    assert response.json()['blocks'][0]['sources'] == sources[::-1]
    assert response.json()['entities'] == before['entities']
    for invalid in ([], ['missing']):
        view['sources'] = invalid
        assert client.post('/api/v2/concept-workspaces/update-view', json={'workspace': workspace, 'view': view}).status_code == 422
    # A valid key source is incompatible with a degree strip, even when requested directly.
    workspace['entities'].append({'id': 'key', 'kind': 'key', 'root': 'G', 'mode': 'major'})
    strip = next(block for block in workspace['blocks'] if block['kind'] == 'degree_strip')
    view.update(id=strip['id'], sources=['key'])
    assert client.post('/api/v2/concept-workspaces/update-view', json={'workspace': workspace, 'view': view}).status_code == 422
    persisted = client.get(f'/api/v2/sessions/{sid}').json()['branches'][-1]['working_draft']
    assert persisted == before
