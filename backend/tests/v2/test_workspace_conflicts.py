import pytest

from app.v2.harmony_state import HarmonyExploration
from app.v2.progression_state import ProgressionIdeaDraft, ProgressionWorkspaceState, artifact_payload
from app.v2.store import InMemoryV2Store
from tests.v2.test_tutor_router import _app


@pytest.mark.parametrize(("method", "path", "data"), [
    ("PATCH", "/harmony", {"tonal_center": {"root": "G", "scale": "major"}}),
    ("PATCH", "/progression", {"label": "My edit"}),
    ("POST", "/explore", {"subject": {"root": "G", "scale": "major"}, "confirmed": True}),
    ("POST", "/progression/open/{artifact_id}", None),
])
def test_workspace_edits_preserve_an_intervening_write(monkeypatch, method, path, data):
    store = InMemoryV2Store()
    client = _app(store, lambda *args, **kwargs: pytest.fail("No provider needed"))
    session = store.create_session("user_1")
    idea = ProgressionIdeaDraft(label="Original")
    workspace = ProgressionWorkspaceState(ideas=[idea], active_idea_id=idea.id)
    branch = store.update_branch(session.id, session.branches[0].id, "user_1", progression_workspace=workspace)
    artifact = store.create_artifact("user_1", "progression", idea.label, artifact_payload(idea).model_dump())
    update_branch = store.update_branch
    concurrent = None

    def intervening_update(*args, **fields):
        nonlocal concurrent
        changed = workspace.model_dump()
        changed["ideas"][0]["label"] = "Tutor revision"
        concurrent = update_branch(session.id, branch.id, "user_1",
            harmony_exploration=HarmonyExploration(tonal_center={"root": "D", "scale": "natural_minor"}),
            progression_workspace=ProgressionWorkspaceState.model_validate(changed))
        return update_branch(*args, **fields)

    monkeypatch.setattr(store, "update_branch", intervening_update)
    response = client.request(method,
        f"/api/v2/sessions/{session.id}/branches/{branch.id}" + path.format(artifact_id=artifact.id), json=data)

    assert response.status_code == 409, response.text
    assert store.get_session(session.id, "user_1").branches[0] == concurrent
