"""HTTP-level acceptance tests for the V2 tutor endpoint (ticket #13) — the
primary seam per the parent spec's Testing Decisions: real V2 public APIs,
deterministic/stubbed LLM boundary, no real network call. Covers: answering
a contextual question through the V2 path, statelessness across separately
constructed agent instances, restart survival using only persisted state,
provider-switch-without-losing-context, ownership validated before any
provider call, and capability-error failing clearly.
"""

from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.dependencies.auth import get_current_user
from app.v2.router import get_tutor_model_factory, router
from app.v2.store import InMemoryV2Store, V2Store, get_v2_store
from tests.v2.tutor_fakes import ScriptedTutorModel


def _settings(**overrides) -> Settings:
    fields = dict(v2_tutor_provider="openai", openai_api_key="k", anthropic_api_key="k", openrouter_api_key="k")
    fields.update(overrides)
    return Settings(**fields)


def _app(store: V2Store, model_factory, settings: Settings | None = None) -> TestClient:
    app = FastAPI()
    app.include_router(router, prefix="/api/v2")
    app.dependency_overrides[get_current_user] = lambda: "user_1"
    app.dependency_overrides[get_v2_store] = lambda: store
    app.dependency_overrides[get_settings] = lambda: settings or _settings()
    app.dependency_overrides[get_tutor_model_factory] = lambda: model_factory
    return TestClient(app)


def _scripted_factory(model: ScriptedTutorModel):
    def factory(provider, model_name, cache_key, **kwargs):
        return model

    return factory


def _open_session_and_branch(client: TestClient) -> tuple[str, str]:
    created = client.post("/api/v2/sessions").json()
    return created["id"], created["branches"][0]["id"]


def test_tutor_turn_answers_a_contextual_question_through_the_v2_path() -> None:
    store = InMemoryV2Store()
    model = ScriptedTutorModel(
        outcomes=[{"message": "That's a G major chord.", "focus": {"role": "active", "notes": [{"string": 6, "fret": 3}]}}],
        usage_metadatas=[{"input_tokens": 50, "output_tokens": 10, "total_tokens": 60}],
    )
    client = _app(store, _scripted_factory(model))
    session_id, branch_id = _open_session_and_branch(client)

    response = client.post(
        "/api/v2/tutor/turns",
        json={"session_id": session_id, "branch_id": branch_id, "message": "What chord is this?"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["message"] == "That's a G major chord."
    assert body["focus"]["role"] == "active"
    assert body["provider"] == "openai"
    assert body["status"] == "completed"
    assert body["usage"]["input_tokens"] == 50


def test_tutor_turn_persists_the_user_and_assistant_messages() -> None:
    store = InMemoryV2Store()
    model = ScriptedTutorModel(outcomes=[{"message": "An answer.", "focus": None}], usage_metadatas=[None])
    client = _app(store, _scripted_factory(model))
    session_id, branch_id = _open_session_and_branch(client)
    thread_id = store.get_session(session_id, "user_1").branches[0].tutor_thread_id

    client.post("/api/v2/tutor/turns", json={"session_id": session_id, "branch_id": branch_id, "message": "Hello tutor."})

    persisted = store.list_tutor_messages(thread_id, "user_1")
    assert [m.role for m in persisted] == ["user", "assistant"]
    assert persisted[0].content["text"] == "Hello tutor."
    assert persisted[1].content["text"] == "An answer."


def test_tutor_turn_persists_a_concept_suggestion_for_explicit_promotion() -> None:
    store = InMemoryV2Store()
    model = ScriptedTutorModel(
        outcomes=[{
            "message": "That phrase uses A minor pentatonic.",
            "focus": None,
            "concept_suggestion": {
                "concept_id": "pentatonic_minor",
                "root": "A",
                "label": "A minor pentatonic",
            },
        }],
        usage_metadatas=[None],
    )
    client = _app(store, _scripted_factory(model))
    session_id, branch_id = _open_session_and_branch(client)
    thread_id = store.get_session(session_id, "user_1").branches[0].tutor_thread_id

    response = client.post(
        "/api/v2/tutor/turns",
        json={"session_id": session_id, "branch_id": branch_id, "message": "Is this A minor pentatonic?"},
    )

    assert response.status_code == 200
    assert response.json()["concept_suggestion"]["label"] == "A minor pentatonic"
    persisted = store.list_tutor_messages(thread_id, "user_1")
    assert persisted[-1].content["concept_suggestion"]["concept_id"] == "pentatonic_minor"
    assert len(store.get_session(session_id, "user_1").branches) == 1


def test_two_consecutive_turns_with_separately_constructed_agents_preserve_context() -> None:
    """Each HTTP call gets its own freshly-built ScriptedTutorModel (nothing
    shared but the store's persisted rows) — the second turn's model must
    still see the first turn's exchange, proving reconstruction from V2
    persistence rather than any shared in-memory agent object."""
    store = InMemoryV2Store()
    first_model = ScriptedTutorModel(outcomes=[{"message": "Sure, Little Wing uses Em.", "focus": None}], usage_metadatas=[None])
    client = _app(store, _scripted_factory(first_model))
    session_id, branch_id = _open_session_and_branch(client)

    first = client.post(
        "/api/v2/tutor/turns",
        json={"session_id": session_id, "branch_id": branch_id, "message": "I'm studying Little Wing, what key is it in?"},
    )
    assert first.status_code == 200

    second_model = ScriptedTutorModel(outcomes=[{"message": "As I said, Em.", "focus": None}], usage_metadatas=[None])
    client.app.dependency_overrides[get_tutor_model_factory] = lambda: _scripted_factory(second_model)

    second = client.post(
        "/api/v2/tutor/turns",
        json={"session_id": session_id, "branch_id": branch_id, "message": "What key did you say again?"},
    )

    assert second.status_code == 200
    second_call_text = " ".join(str(m.content) for m in second_model.calls[0])
    assert "Little Wing" in second_call_text
    assert first_model is not second_model


def test_simulated_process_restart_between_turns_preserves_conversation() -> None:
    """Build an entirely separate FastAPI app/TestClient/model for the
    second turn (representing a fresh process) — only the store's durable
    data is shared, matching spec #10's "process restart between turns must
    be unobservable to the user"."""
    store = InMemoryV2Store()
    first_model = ScriptedTutorModel(outcomes=[{"message": "Your favorite key is D major.", "focus": None}], usage_metadatas=[None])
    first_client = _app(store, _scripted_factory(first_model))
    session_id, branch_id = _open_session_and_branch(first_client)
    first_client.post(
        "/api/v2/tutor/turns",
        json={"session_id": session_id, "branch_id": branch_id, "message": "Remember: my favorite key is D major."},
    )
    del first_client  # drop everything process-local except `store`

    second_model = ScriptedTutorModel(outcomes=[{"message": "D major.", "focus": None}], usage_metadatas=[None])
    second_client = _app(store, _scripted_factory(second_model))  # brand new app/client/model

    second = second_client.post(
        "/api/v2/tutor/turns",
        json={"session_id": session_id, "branch_id": branch_id, "message": "What's my favorite key again?"},
    )

    assert second.status_code == 200
    second_call_text = " ".join(str(m.content) for m in second_model.calls[0])
    assert "D major" in second_call_text


def test_switching_configured_provider_between_turns_does_not_lose_context() -> None:
    store = InMemoryV2Store()
    openai_model = ScriptedTutorModel(outcomes=[{"message": "Sure, Little Wing.", "focus": None}], usage_metadatas=[None])
    client = _app(store, _scripted_factory(openai_model), settings=_settings(v2_tutor_provider="openai"))
    session_id, branch_id = _open_session_and_branch(client)

    client.post(
        "/api/v2/tutor/turns",
        json={"session_id": session_id, "branch_id": branch_id, "message": "I'm studying Little Wing."},
    )

    anthropic_model = ScriptedTutorModel(outcomes=[{"message": "It's about Little Wing, yes.", "focus": None}], usage_metadatas=[None])
    client.app.dependency_overrides[get_tutor_model_factory] = lambda: _scripted_factory(anthropic_model)
    client.app.dependency_overrides[get_settings] = lambda: _settings(v2_tutor_provider="anthropic")

    second = client.post(
        "/api/v2/tutor/turns",
        json={"session_id": session_id, "branch_id": branch_id, "message": "What song again?"},
    )

    assert second.status_code == 200
    assert second.json()["provider"] == "anthropic"
    second_call_text = " ".join(str(m.content) for m in anthropic_model.calls[0])
    assert "Little Wing" in second_call_text


def test_ownership_is_validated_before_any_provider_call() -> None:
    store = InMemoryV2Store()
    calls: list[Any] = []

    def factory(provider, model_name, cache_key, **kwargs):
        calls.append(1)
        raise AssertionError("must not be called for an unowned branch")

    client = _app(store, factory)
    other_session_id, other_branch_id = _open_session_and_branch(client)
    # A different user's session must 404 without ever touching the model factory.
    client.app.dependency_overrides[get_current_user] = lambda: "someone_else"

    response = client.post(
        "/api/v2/tutor/turns",
        json={"session_id": other_session_id, "branch_id": other_branch_id, "message": "hi"},
    )

    assert response.status_code == 404
    assert calls == []


def test_tutor_turn_resolves_and_returns_progression_candidates() -> None:
    store = InMemoryV2Store()
    model = ScriptedTutorModel(
        outcomes=[
            {
                "message": "Here's an idea inspired by this passage.",
                "focus": None,
                "candidates": [{"title": "Wistful I-vi-IV-V", "chords": [{"root": "C", "quality": "major"}]}],
            }
        ],
        usage_metadatas=[None],
    )
    client = _app(store, _scripted_factory(model))
    session_id, branch_id = _open_session_and_branch(client)

    response = client.post(
        "/api/v2/tutor/turns",
        json={"session_id": session_id, "branch_id": branch_id, "message": "make me something wistful"},
    )

    assert response.status_code == 200
    candidates = response.json()["candidates"]
    assert candidates[0]["title"] == "Wistful I-vi-IV-V"
    assert candidates[0]["chords"][0]["voicing"]  # resolved server-side, deterministically


def test_progression_candidates_remain_addressable_in_a_follow_up_turn() -> None:
    """Acceptance criterion: "Progression candidates remain session state
    until applied/saved/dismissed and remain addressable in follow-up
    turns." Proven the same way every other statelessness test in this file
    is: a second, separately-scripted model must still see the first turn's
    candidate -- reconstructed purely from persisted TutorMessage rows."""
    store = InMemoryV2Store()
    first_model = ScriptedTutorModel(
        outcomes=[
            {
                "message": "Here are two ideas.",
                "focus": None,
                "candidates": [
                    {"title": "Wistful I-vi-IV-V", "chords": [{"root": "C", "quality": "major"}]},
                    {"title": "Moody ii-V-I", "chords": [{"root": "D", "quality": "minor"}]},
                ],
            }
        ],
        usage_metadatas=[None],
    )
    client = _app(store, _scripted_factory(first_model))
    session_id, branch_id = _open_session_and_branch(client)
    client.post(
        "/api/v2/tutor/turns",
        json={"session_id": session_id, "branch_id": branch_id, "message": "make me something wistful"},
    )

    second_model = ScriptedTutorModel(outcomes=[{"message": "Saving the second one.", "focus": None}], usage_metadatas=[None])
    client.app.dependency_overrides[get_tutor_model_factory] = lambda: _scripted_factory(second_model)

    second = client.post(
        "/api/v2/tutor/turns",
        json={"session_id": session_id, "branch_id": branch_id, "message": "save the second one"},
    )

    assert second.status_code == 200
    second_call_text = " ".join(str(m.content) for m in second_model.calls[0])
    assert "Moody ii-V-I" in second_call_text
    assert "Wistful I-vi-IV-V" in second_call_text


def test_persisted_assistant_message_carries_structured_candidates_for_history_reload() -> None:
    """The frontend reconstructs a prior turn's candidates from the same
    persisted TutorMessage row (not just the model-facing text summary) so a
    history reload can re-render them -- see router.py's persistence call
    and prompt.py's reconstruct_history for the model-facing side."""
    store = InMemoryV2Store()
    model = ScriptedTutorModel(
        outcomes=[
            {
                "message": "An idea.",
                "focus": None,
                "candidates": [{"title": "Idea", "chords": [{"root": "C", "quality": "major"}]}],
            }
        ],
        usage_metadatas=[None],
    )
    client = _app(store, _scripted_factory(model))
    session_id, branch_id = _open_session_and_branch(client)
    thread_id = store.get_session(session_id, "user_1").branches[0].tutor_thread_id

    client.post("/api/v2/tutor/turns", json={"session_id": session_id, "branch_id": branch_id, "message": "make me something"})

    history = client.get(f"/api/v2/tutor/threads/{thread_id}/messages").json()
    assistant_message = next(m for m in history if m["role"] == "assistant")
    assert assistant_message["content"]["candidates"][0]["title"] == "Idea"
    assert assistant_message["content"]["candidates"][0]["chords"][0]["voicing"]


def test_capability_error_returns_422_and_persists_nothing() -> None:
    store = InMemoryV2Store()
    model = ScriptedTutorModel(unsupported_tools=True)
    client = _app(store, _scripted_factory(model))
    session_id, branch_id = _open_session_and_branch(client)
    thread_id = store.get_session(session_id, "user_1").branches[0].tutor_thread_id

    response = client.post(
        "/api/v2/tutor/turns",
        json={"session_id": session_id, "branch_id": branch_id, "message": "hi"},
    )

    assert response.status_code == 422
    assert store.list_tutor_messages(thread_id, "user_1") == []
