from app.v2.store import InMemoryV2Store
from tests.v2.test_tutor_router import _app, _scripted_factory, _open_session_and_branch
from tests.v2.tutor_fakes import ScriptedTutorModel


def test_harmony_repairs_progression_candidates_with_specific_feedback():
    invalid = {'message': 'Try these chords.', 'candidates': {'candidate_kind': 'progression-idea', 'candidates': []}}
    class RepairModel(ScriptedTutorModel):
        def _generate(self, messages, **kwargs):
            feedback = str(messages[-1].content)
            corrected = 'Candidates outside active workspace' in feedback and 'candidates=null' in feedback
            self.outcomes = [invalid, {'message': 'Try Am, F, C and G. Open a Progression to arrange and practise them.'} if corrected else invalid]
            return super()._generate(messages, **kwargs)
    model = RepairModel()
    client = _app(InMemoryV2Store(), _scripted_factory(model))
    session, branch = _open_session_and_branch(client)
    response = client.post('/api/v2/tutor/turns', json={'session_id': session, 'branch_id': branch, 'message': 'Suggest a chord sequence'})
    assert response.status_code == 200
    feedback = str(model.calls[1][-1].content)
    assert 'Candidates outside active workspace' in feedback
    assert 'harmony' in feedback
    assert 'candidates=null' in feedback
    assert response.json()['candidates'] is None
    assert response.json()['branch']['active_workspace'] == 'harmony'
