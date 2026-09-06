from tests.v2.test_workspace_tutor import setup


def test_old_concept_surfaces_are_gone_and_saved_payloads_fail_without_mutation():
    store, model, client, sid, branch = setup()
    old = store.create_artifact('user_1','concept_study','Old study',{'root':'C','concept_id':'major'})
    before = store.get_session(sid,'user_1')
    opened = client.post(f'/api/v2/library/{old.id}/open')
    assert opened.status_code == 422
    assert 'exploration' in opened.json()['detail']
    assert store.get_artifact(old.id,'user_1') == old
    assert store.get_session(sid,'user_1') == before
    for path in ['/api/v2/study/catalog','/api/v2/study/visualizations/major?root=C']:
        assert client.get(path).status_code == 404
    assert model.calls == []
    for concept in ['dorian','caged','chord_minor','circle']:
        opened = client.post(f'/api/v2/sessions/{sid}/concept-workspaces/from-concept',json={'concept_id':concept,'root':'F#'})
        assert opened.status_code == 201, opened.text
        assert opened.json()['working_draft']['entities'][0]['root'] == 'F#'
        assert opened.json()['current_artifact_id'] is None
    assert client.post(f'/api/v2/sessions/{sid}/concept-workspaces/from-concept',json={'concept_id':'unknown','root':'C'}).status_code == 422
