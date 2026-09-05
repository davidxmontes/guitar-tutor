import pytest
from app.v2.concepts import build_concept_study, get_study_catalog

@pytest.mark.parametrize('key,minor,signature,chords', [
    ('D','B',['F#','C#'],['D','E','F#','G','A','B','C#']),
    ('Eb','C',['Bb','Eb','Ab'],['Eb','F','G','Ab','Bb','C','D']),
    ('Gb','Eb',['Bb','Eb','Ab','Db','Gb','Cb'],['Gb','Ab','Bb','Cb','Db','Eb','F']),
])
def test_circle_keys_are_spelled_and_related_correctly(key, minor, signature, chords):
    study = build_concept_study(key, 'circle', selected_chord=4, selected_sequence='pop')
    assert study.relative_minor == minor
    assert study.accidentals == signature
    assert [c.chord.root for c in study.chords] == chords
    assert [c.numeral for c in study.chords] == ['I','ii','iii','IV','V','vi','vii°']
    assert [n.note for n in study.notes] == [chords[i] for i in [4,6,1]]
    assert study.neighbors == [chords[3], chords[4]]
    assert study.sequences[1].degrees == [0,4,5,3]
    assert study.positions

def test_circle_is_in_catalog_and_rejects_unknown_state():
    assert 'circle' in [c.id for g in get_study_catalog().groups if g.id == 'systems' for c in g.concepts]
    for overrides in [{'selected_chord': 7}, {'selected_sequence': 'unknown'}]:
        with pytest.raises(ValueError):
            build_concept_study('C', 'circle', **overrides)

from tests.v2.test_concept_studies_router import client, store, session_and_branch


def test_circle_promotion_preserves_source_and_opens_editable_progression(client, store, session_and_branch):
    sid, bid = session_and_branch
    before = client.get(f'/api/v2/sessions/{sid}').json()['branches'][0]
    response = client.post('/api/v2/study/circle/explore', json={'session_id': sid, 'branch_id': bid, 'root': 'D', 'selected_chord': 4, 'selected_sequence': 'pop'})
    assert response.status_code == 201, response.text
    opened = response.json()
    assert [c['root'] for c in opened['artifact']['payload']['chords']] == ['D','A','B','G']
    source = opened['source_branch']
    assert source['current_artifact_id'] == before['current_artifact_id']
    assert source['tutor_thread_id'] == before['tutor_thread_id']
    assert source['recent_ideas'][-1] == {'type': 'circle_study', 'root': 'D', 'selected_chord': 4, 'selected_sequence': 'pop', 'overlay': 'notes'}
    assert opened['branch']['tutor_thread_id'] != source['tutor_thread_id']
    chord = opened['artifact']['payload']['chords'][0]
    chord['voicing'] = [{'string': 1, 'fret': 10}]
    changed = client.patch(f"/api/v2/progressions/{opened['artifact']['id']}/voicing", json={'expected_updated_at': opened['artifact']['updated_at'], 'chord_index': 0, 'chord': chord})
    assert changed.status_code == 200
    assert client.get(f'/api/v2/sessions/{sid}').json()['branches'][0]['recent_ideas'] == source['recent_ideas']
    assert client.post('/api/v2/study/circle/explore', json={'session_id': 'foreign', 'branch_id': bid, 'root': 'C'}).status_code == 404
