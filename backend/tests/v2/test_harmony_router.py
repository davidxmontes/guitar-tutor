from tests.v2.test_tutor_router import _app
from app.v2.store import InMemoryV2Store


def test_concept_entry_and_edits_never_call_model_and_hold_surface():
    store = InMemoryV2Store()
    def no_model(*args, **kwargs):
        raise AssertionError('Concept entry must be deterministic')
    client = _app(store, no_model)
    entry = client.post('/api/v2/harmony/open', json={'root': 'A', 'scale': 'dorian'})
    assert entry.status_code == 200, entry.text
    session = entry.json()
    branch = session['branches'][0]
    url = f"/api/v2/sessions/{session['id']}/branches/{branch['id']}/harmony"
    surface = client.get(url).json()
    assert surface['composition']['pattern'] == 'hero-with-support'
    assert surface['composition']['slots']['hero'][0]['kind'] == 'fretboard'
    assert surface['resolved']['palette'][3]['root'] == 'D'
    updated = client.patch(url, json={'tonal_center': {'root': 'G', 'scale': 'major'}}).json()
    assert updated['composition'] == surface['composition']
    assert updated['resolved']['palette'][0]['root'] == 'G'
    focused = client.patch(url, json={'focus': {'kind': 'degree', 'degree': 3}}).json()
    assert focused['branch']['harmony_exploration']['focus']['degree'] == 3
    scratch = client.patch(url, json={'add_scratch': {'root': 'C', 'quality': 'major'}}).json()
    assert scratch['branch']['harmony_exploration']['scratch'][0]['root'] == 'C'
    assert client.patch(url, json={'unknown': 2}).status_code == 422
