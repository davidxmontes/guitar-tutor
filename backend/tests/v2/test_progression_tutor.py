import pytest
from app.v2.store import InMemoryV2Store
from app.v2.progression_state import ProgressionIdeaDraft, ProgressionWorkspaceState
from app.v2.tutor.contract import TutorTerminal
from app.v2.tutor.runner import resolve_turn_music


def branch():
    value = InMemoryV2Store().create_session('owner').branches[0]
    idea = ProgressionIdeaDraft(label='Original', tonal_center={'root': 'C', 'scale': 'major'}, chords=[{'id': 'one', 'root': 'C', 'quality': 'major'}, {'id': 'two', 'root': 'G', 'quality': 'major'}])
    value.progression_workspace = ProgressionWorkspaceState(ideas=[idea], active_idea_id=idea.id)
    value.active_workspace = 'progression'
    return value


def test_mutations_candidates_order_and_idempotent_keep():
    from app.v2.progression_tutor import keep_candidate
    value = branch()
    candidate = {'id': 'dark', 'label': 'Darker', 'chords': [{'root': 'E', 'quality': 'minor'}]}
    terminal = TutorTerminal(message='Try', mutation={'kind': 'set_tonal_center', 'tonal_center': {'root': 'E', 'scale': 'natural_minor'}}, candidates={'candidate_kind': 'progression-idea', 'candidates': [candidate]})
    updated = resolve_turn_music(value, terminal)
    assert len(updated.progression_workspace.ideas) == 1
    resolved = terminal.candidates.candidates[0]
    assert resolved['idea']['tonal_center']['root'] == 'E'
    kept = keep_candidate(updated, 'progression-idea', resolved)
    assert len(kept.progression_workspace.ideas) == 2
    assert len(keep_candidate(kept, 'progression-idea', resolved).progression_workspace.ideas) == 2
    for mutation in [{'kind': 'progression_add', 'chord': {'root': 'A', 'quality': 'minor'}}, {'kind': 'progression_remove', 'step_id': 'one'}, {'kind': 'progression_reorder', 'ids': ['two','one']}, {'kind': 'progression_edit', 'step_id': 'one', 'chord': {'root': 'D', 'quality': 'minor7'}}, {'kind': 'set_duration', 'step_id': 'one', 'duration_beats': 3}, {'kind': 'assign_step_voicing', 'step_id': 'one', 'voicing_label': 'Pos 1'}, {'kind': 'add_kept_note_group', 'group': {'id': 'n', 'label': 'C', 'notes': [{'pitch_class': 0}]}}]:
        changed = resolve_turn_music(value, TutorTerminal(message='Changed', mutation=mutation))
        assert changed.progression_workspace != value.progression_workspace
        with pytest.raises(ValueError): TutorTerminal(message='Bad', mutation=mutation | {'positions': [{'string': 1, 'fret': 0}]})


def test_develop_preserves_scratch_and_replacement_touches_one_step():
    from app.v2.progression_tutor import develop_harmony, keep_candidate
    from app.v2.harmony_state import HarmonyExploration
    value = branch()
    value.harmony_exploration = HarmonyExploration(tonal_center={'root': 'G', 'scale': 'major'}, scratch=[{'id': str(i), 'root': root, 'quality': quality} for i,(root,quality) in enumerate([('A','minor7'),('D','dominant7'),('G','major7')])])
    before = value.harmony_exploration.model_dump()
    developed = develop_harmony(value)
    idea = developed.progression_workspace.ideas[-1]
    assert [step.quality for step in idea.chords] == ['minor7','dominant7','major7']
    assert all(step.duration_beats == 4 for step in idea.chords)
    assert developed.harmony_exploration.model_dump() == before
    assert idea.provenance.scratch[0].root == 'A'
    developed.harmony_exploration.scratch[0].root = 'C'
    assert idea.provenance.scratch[0].root == 'A'
    terminal = TutorTerminal(message='Options', candidates={'candidate_kind': 'chord-replacement', 'candidates': [{'id': 'c', 'label': 'Dm7', 'step_id': 'one', 'chord': {'root':'D','quality':'minor7'}}]})
    unchanged = resolve_turn_music(value, terminal)
    assert unchanged == value
    changed = keep_candidate(value, 'chord-replacement', terminal.candidates.candidates[0])
    assert changed.progression_workspace.ideas[0].chords[0].quality == 'minor7'
    assert changed.progression_workspace.ideas[0].chords[1] == value.progression_workspace.ideas[0].chords[1]


def test_scripted_combined_turn_and_keep_routes():
    from tests.v2.test_tutor_router import _app, _scripted_factory
    from tests.v2.tutor_fakes import ScriptedTutorModel
    store = InMemoryV2Store()
    session = store.create_session('user_1'); initial = branch()
    current = store.update_branch(session.id, session.branches[0].id, 'user_1', progression_workspace=initial.progression_workspace, active_workspace='progression')
    model = ScriptedTutorModel(outcomes=[{'message': 'Changed and offered an idea.', 'mutation': {'kind': 'transpose', 'semitones': 4, 'tonal_center': {'root':'E','scale':'natural_minor'}}, 'candidates': {'candidate_kind':'progression-idea', 'candidates':[{'id':'dark','label':'Dark','chords':[{'root':'E','quality':'minor'}]}]}, 'presentation': {'pattern':'hero-with-support','focal':'hero','slots':{'hero':[{'kind':'candidate-set'}],'support':[{'kind':'explanation'}]}}}])
    client = _app(store, _scripted_factory(model))
    result = client.post('/api/v2/tutor/turns', json={'session_id':session.id,'branch_id':current.id,'message':'Transpose and vary'}).json()
    assert result['branch']['progression_workspace']['ideas'][0]['chords'][0]['root'] == 'E'
    assert result['candidates']['candidates'][0]['idea']['tonal_center']['root'] == 'E'
    url = f'/api/v2/sessions/{session.id}/branches/{current.id}/candidates/keep'
    request = {'turn_id':result['branch']['live_presentation_turn_id'],'candidate_id':'dark'}
    kept = client.post(url,json=request).json()
    developed = client.post(url,json=request | {'develop':True}).json()
    assert len(kept['progression_workspace']['ideas']) == len(developed['progression_workspace']['ideas']) == 2
    assert developed['live_presentation_turn_id'] is None
    assert not store.list_artifacts('user_1') and len(store.get_session(session.id,'user_1').branches) == 1
    assert client.post(url,json=request | {'candidate_id':'missing'}).status_code == 404
