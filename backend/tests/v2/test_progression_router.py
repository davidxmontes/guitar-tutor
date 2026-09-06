"""Per-idea save/revision and fresh reopen through owned HTTP routes."""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.dependencies.auth import get_current_user
from app.v2.router import router
from app.v2.store import InMemoryV2Store, get_v2_store, RevisionConflictError
from app.v2.progression_state import ProgressionIdeaDraft, ProgressionWorkspaceState
from app.v2.turns import live_composition


def test_save_one_idea_revisions_reopen_and_rollback(monkeypatch):
    store = InMemoryV2Store()
    app = FastAPI(); app.include_router(router, prefix='/api/v2')
    app.dependency_overrides[get_current_user] = lambda: 'owner'
    app.dependency_overrides[get_v2_store] = lambda: store
    client = TestClient(app)
    session = store.create_session('owner'); branch = session.branches[0]
    a, b = [ProgressionIdeaDraft(label=label, chords=[{'root': 'C', 'quality': 'major'}]) for label in ['A', 'B']]
    branch = store.update_branch(session.id, branch.id, 'owner', progression_workspace=ProgressionWorkspaceState(ideas=[a,b], active_idea_id=a.id), active_workspace='progression')
    url = f'/api/v2/sessions/{session.id}/branches/{branch.id}/progression'
    result = client.post(url+'/save', json={'expected_updated_at': branch.updated_at})
    assert result.status_code == 200, result.text
    artifact = result.json()['artifact']
    branch = store.get_session(session.id, 'owner').branches[0]
    assert branch.progression_workspace.ideas[0].artifact_id == artifact['id']
    assert branch.progression_workspace.ideas[1].artifact_id is None
    assert branch.progression_workspace.ideas[1].dirty
    stale = branch.model_copy(deep=True)
    data = branch.progression_workspace.model_dump(); data['ideas'][0]['label'] = 'A revised'; data['ideas'][0]['dirty'] = True
    branch = store.update_branch(session.id, branch.id, 'owner', progression_workspace=ProgressionWorkspaceState.model_validate(data))
    with pytest.raises(RevisionConflictError): store.save_progression_idea(stale, 'owner')
    branch, revised = store.save_progression_idea(branch, 'owner')
    assert len(revised.revisions) == 1 and revised.revisions[0].payload['title'] == 'A'
    assert revised.title == 'A revised'
    data = branch.progression_workspace.model_dump(); data['active_idea_id'] = b.id
    branch = store.update_branch(session.id, branch.id, 'owner', progression_workspace=ProgressionWorkspaceState.model_validate(data))
    branch, second = store.save_progression_idea(branch, 'owner')
    assert second.id != revised.id and len(store.list_artifacts('owner')) == 2
    reopened = client.post(f"/api/v2/library/{revised.id}/open").json()['branches'][0]
    idea = reopened['progression_workspace']['ideas'][0]
    assert idea['id'] != a.id and idea['artifact_id'] == revised.id and not idea['dirty']
    assert reopened['live_presentation_turn_id'] is None
    into = client.post(url+f'/open/{revised.id}').json()
    assert len(into['progression_workspace']['ideas']) == 3
    current = store.get_session(session.id, 'owner').branches[0]
    assert live_composition(current, []).slots
    before = current.model_copy(deep=True)
    data = current.progression_workspace.model_dump(); data['ideas'][-1]['label'] = 'Fail'
    current = store.update_branch(session.id, branch.id, 'owner', progression_workspace=ProgressionWorkspaceState.model_validate(data))
    original = store._update_branch
    monkeypatch.setattr(store, '_update_branch', lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError('injected')))
    with pytest.raises(RuntimeError): store.save_progression_idea(current, 'owner')
    assert store.get_artifact(revised.id, 'owner').payload['title'] == 'A revised'
    monkeypatch.setattr(store, '_update_branch', original)
    assert client.post(url+'/save', json={'expected_updated_at': before.updated_at}).status_code == 409
    app.dependency_overrides[get_current_user] = lambda: 'other'
    assert client.post(url+'/save', json={'expected_updated_at': current.updated_at}).status_code == 404
