import pytest
from pydantic import ValidationError

from app.v2.harmony import resolve_harmony, change_tuning
from app.v2.harmony_state import HarmonyExploration
from app.v2.store import InMemoryV2Store
from tests.v2.test_tutor_router import _app


C_SHAPE = [{'string': 1, 'fret': 0}, {'string': 2, 'fret': 1}, {'string': 3, 'fret': 0}]


def shape(positions=C_SHAPE, interpretation=None, **fields):
    return HarmonyExploration(focus={'kind': 'shape', 'positions': positions, 'interpretation': interpretation}, **fields)


def discovery(state):
    return resolve_harmony(state)['discovery']


def test_exact_partial_ambiguous_and_doubled_notes_are_distinct():
    result = discovery(shape())
    exact = [m for m in result['matches'] if not m['missing']]
    assert [m['chord'] for m in exact] == [{'root': 'C', 'quality': 'major'}]
    assert result['bass']['note'] == 'G'
    doubled = discovery(shape(C_SHAPE + [{'string': 5, 'fret': 3}]))
    assert [m['chord'] for m in doubled['matches'] if not m['missing']] == [m['chord'] for m in exact]
    partial = discovery(shape(C_SHAPE[:2]))
    c = next(m for m in partial['matches'] if m['chord'] == {'root': 'C', 'quality': 'major'})
    assert [n['note'] for n in c['missing']] == ['G']
    assert not any(not m['missing'] for m in partial['matches'])
    ambiguous = discovery(shape(C_SHAPE + [{'string': 5, 'fret': 0}]))
    assert {'C6', 'Am7'} <= {m['label'] for m in ambiguous['matches'] if not m['missing']}


def test_empty_single_note_unknown_and_retuning_do_not_invent_a_chord():
    assert discovery(shape([]))['matches'] == []
    assert discovery(shape(C_SHAPE[:1]))['matches'] == []
    cluster = [{'string': 1, 'fret': 8}, {'string': 2, 'fret': 2}, {'string': 3, 'fret': 7}]
    assert discovery(shape(cluster))['matches'] == []
    state = shape([{'string': 6, 'fret': 0}], tuning=[64, 59, 55, 50, 45, 38])
    assert discovery(state)['positions'][0]['note'] == 'D'
    interpreted = shape(interpretation={'root': 'C', 'quality': 'major'})
    changed = change_tuning(interpreted, [66, 59, 55, 50, 45, 40])
    assert changed.focus.positions == interpreted.focus.positions
    assert changed.focus.interpretation is None


def test_suggestions_are_concrete_complete_shapes_and_completions_keep_input():
    state = shape(C_SHAPE[:2], {'root': 'C', 'quality': 'major'})
    result = discovery(state)
    assert result['completions']
    for suggestion in result['completions']:
        assert all(p in suggestion['positions'] for p in C_SHAPE[:2])
        assert len({p['string'] for p in suggestion['positions']}) == len(suggestion['positions'])
        check = discovery(shape(suggestion['positions']))
        assert any(m['chord'] == suggestion['chord'] and not m['missing'] for m in check['matches'])
    full = discovery(shape(interpretation={'root': 'C', 'quality': 'major'}))
    assert any(s['chord']['quality'] == 'major7' for s in full['alterations'])
    assert full['voicings']


@pytest.mark.parametrize('positions', [
    [{'string': 1, 'fret': 0}, {'string': 1, 'fret': 2}],
    [{'string': 7, 'fret': 0}], [{'string': 1, 'fret': 25}],
])
def test_invalid_shapes_are_rejected(positions):
    with pytest.raises(ValidationError):
        shape(positions)


def test_shape_roundtrip_and_client_revision_conflict():
    client = _app(InMemoryV2Store(), lambda **kw: pytest.fail('Gestures must not call the model'))
    session = client.post('/api/v2/sessions').json()
    branch = session['branches'][0]
    url = f"/api/v2/sessions/{session['id']}/branches/{branch['id']}/harmony"
    response = client.patch(url, json={'focus': shape().focus.model_dump(), 'expected_updated_at': branch['updated_at']})
    assert response.status_code == 200, response.text
    assert client.get(url).json()['branch']['harmony_exploration']['focus'] == shape().focus.model_dump()
    assert client.patch(url, json={'focus': shape([]).focus.model_dump(), 'expected_updated_at': branch['updated_at']}).status_code == 409
    assert client.get(url).json()['resolved']['discovery']['matches'][0]['chord']['root'] == 'C'


def test_tutor_can_read_shape_but_cannot_invent_a_physical_focus():
    from app.v2.tutor.runner import resolve_turn_music
    from app.v2.tutor.contract import TutorTerminal
    from app.v2.tutor.workspace_tools import workspace_tools
    branch = InMemoryV2Store().create_session('user').branches[0]
    branch.harmony_exploration = shape()
    context = workspace_tools(branch)[0].invoke({})
    assert context['resolved']['discovery']['positions'][0]['note'] == 'E'
    with pytest.raises(ValueError, match='learner'):
        resolve_turn_music(branch, TutorTerminal(message='Changed', focus=shape([]).focus.model_dump()))
