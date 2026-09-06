from tests.v2.test_workspace_tutor import setup


def test_catalog_opens_only_supported_typed_recipes_without_tutor():
    store, model, client, sid, _ = setup()
    response = client.get('/api/v2/concept-workspaces/catalog')
    assert response.status_code == 200
    entries = response.json()
    assert len([e for e in entries if e['starter']]) == 4
    assert len({e['id'] for e in entries}) == len(entries)
    for entry in entries:
        opened = client.post(f'/api/v2/sessions/{sid}/concept-workspaces', json=entry['request'])
        assert opened.status_code == 201, opened.text
        draft = opened.json()['working_draft']
        assert client.post('/api/v2/concept-workspaces/resolve', json=draft).status_code == 200
        if entry['request'].get('mode'):
            assert draft['entities'][0]['mode'] == entry['request']['mode']
    assert model.calls == []
    for request in [{'recipe':'unknown'}, {'recipe':'caged-exploration','mode':'major'}, {'recipe':'scale-comparison','mode':'made-up'}]:
        assert client.post(f'/api/v2/sessions/{sid}/concept-workspaces', json=request).status_code == 422
    saved = client.post(f"/api/v2/sessions/{sid}/branches/{opened.json()['id']}/workspace/save", json={'expected_version':1,'title':'Catalog study'})
    assert saved.status_code == 200
    old = store.create_artifact('user_1','concept_study','Old study',{'root':'C','concept_id':'major'})
    library = client.get('/api/v2/library').json()
    assert next(i for i in library if i['id'] == saved.json()['current_artifact_id'])['is_concept_workspace'] is True
    assert next(i for i in library if i['id'] == old.id)['is_concept_workspace'] is False
