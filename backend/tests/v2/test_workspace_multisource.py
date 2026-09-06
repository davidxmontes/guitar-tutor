"""T2 (#90): multi-source blocks, write-time compatibility, typed Inspection,
the materialize op, and noteGroup entities."""
from app.v2.workspace import pitch_class
from tests.v2.test_workspace_physical import physical
from tests.v2.test_workspace_tutor import patch, setup, turn


def _caged(client, sid):
    branch = client.post(f'/api/v2/sessions/{sid}/concept-workspaces', json={'recipe': 'caged-exploration'}).json()
    return branch, branch['working_draft'], branch['working_draft']['entities'][0]


def test_presets_migrate_source_id_to_sources_list():
    _, _, client, sid, branch = setup()
    for block in branch['working_draft']['blocks']:
        assert block['sources'] == [block['source_id']]


def test_add_block_with_incompatible_source_is_rejected_not_applied():
    _, model, client, sid, branch = setup()
    scale = branch['working_draft']['entities'][0]  # a scale; `circle` accepts only `key`
    model.outcomes = [{'message': 'Adding a circle.', 'workspace_patch': patch(branch, [
        {'op': 'add_block', 'block': {'id': '$c', 'kind': 'circle', 'sources': [scale['id']]}}])}]
    assert turn(client, sid, branch, 'Add a circle of fifths').json()['workspace_result']['status'] == 'rejected'


def test_update_view_changing_sources_to_an_incompatible_kind_is_rejected():
    _, model, client, sid, branch = physical()
    draft = branch['working_draft']
    circle = next(b for b in draft['blocks'] if b['kind'] == 'circle')
    voicing = next(e for e in draft['entities'] if e['kind'] == 'voicing')
    model.outcomes = [{'message': 'Re-aiming the circle.', 'workspace_patch': patch(branch, [
        {'op': 'update_view', 'id': circle['id'], 'settings': {}, 'sources': [voicing['id']]}])}]
    assert turn(client, sid, branch, 'Point that at the D voicing').json()['workspace_result']['status'] == 'rejected'


def test_multi_source_block_binds_two_entities():
    _, _, client, sid, branch = physical()
    diagrams = next(b for b in branch['working_draft']['blocks'] if b['kind'] == 'chord_diagrams')
    assert len(diagrams['sources']) == 2  # the two voicings


def test_materialize_op_turns_a_derived_diatonic_chord_into_a_chord_entity():
    _, model, client, sid, branch = physical()
    draft = branch['working_draft']
    facts = client.post('/api/v2/concept-workspaces/resolve', json=draft).json()
    key = next(e for e in facts['entities'].values() if e['kind'] == 'key')
    ii = key['diatonicChords'][1]
    before = sum(e['kind'] == 'chord' for e in draft['entities'])
    model.outcomes = [{'message': 'Making it concrete.', 'workspace_patch': patch(branch, [
        {'op': 'materialize', 'inspection': {'kind': 'chord', 'root': pitch_class(ii['root']), 'quality': ii['quality']}}])}]
    result = turn(client, sid, branch, 'Turn the ii into a real chord').json()['workspace_result']
    assert result['status'] == 'applied'
    entities = result['branch']['working_draft']['entities']
    assert sum(e['kind'] == 'chord' for e in entities) == before + 1
    assert (entities[-1]['root'], entities[-1]['quality']) == (ii['root'], ii['quality'])


def test_materialize_op_turns_a_caged_region_into_a_voicing_entity():
    _, model, client, sid, _ = setup()
    branch, draft, chord = _caged(client, sid)
    model.outcomes = [{'message': 'Keeping the shape.', 'workspace_patch': patch(branch, [
        {'op': 'materialize', 'inspection': {'kind': 'region', 'source_id': chord['id'], 'key': 'C'}}])}]
    result = turn(client, sid, branch, 'Keep the C shape').json()['workspace_result']
    assert result['status'] == 'applied'
    assert any(e['kind'] == 'voicing' for e in result['branch']['working_draft']['entities'])


def test_add_entity_accepts_a_note_group():
    _, model, client, sid, branch = setup()
    model.outcomes = [{'message': 'Highlighting those notes.', 'workspace_patch': patch(branch, [
        {'op': 'add_entity', 'entity': {'id': '$ng', 'kind': 'noteGroup', 'label': 'Blue notes',
                                        'notes': [{'pitch_class': 3}, {'pitch_class': 6}]}}])}]
    result = turn(client, sid, branch, 'Highlight the blue notes').json()['workspace_result']
    assert result['status'] == 'applied'
    assert result['branch']['working_draft']['entities'][-1]['kind'] == 'noteGroup'
