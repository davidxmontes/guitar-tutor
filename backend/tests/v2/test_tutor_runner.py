"""Stateless-per-run tutor execution tests (ticket #13) — the core
stateless/provider/cache contract, asserted at run_tutor_turn's public seam
(never against private LangGraph node ordering). No real network call: a
`ScriptedTutorModel` (tests/v2/tutor_fakes.py) stands in for every provider.
"""

from typing import Any

import pytest
from langchain_core.messages import SystemMessage

from app.v2.models import Branch, TutorMessage
from app.v2.tutor.providers import TutorCapabilityError
from app.v2.tutor.runner import run_tutor_turn
from tests.v2.tutor_fakes import ScriptedTutorModel


def _branch(**overrides) -> Branch:
    fields = dict(
        id="b1",
        session_id="s1",
        tutor_thread_id="thread-1",
        created_at="2026-01-01T00:00:00Z",
        updated_at="2026-01-01T00:00:00Z",
    )
    fields.update(overrides)
    return Branch(**fields)


def _factory_returning(model: ScriptedTutorModel):
    def factory(provider, model_name, cache_key, **kwargs):
        return model

    return factory


def test_run_tutor_turn_returns_message_focus_and_observability() -> None:
    model = ScriptedTutorModel(
        outcomes=[{"message": "That's a G major triad.", "focus": {"role": "active", "notes": [{"string": 6, "fret": 3}]}}],
        usage_metadatas=[{"input_tokens": 120, "output_tokens": 30, "total_tokens": 150}],
    )

    response = run_tutor_turn(
        branch=_branch(),
        artifact=None,
        history=[],
        user_message="What chord is this?",
        provider="openai",
        model="gpt-4o-mini",
        openai_api_key="k",
        model_factory=_factory_returning(model),
    )

    assert response.message == "That's a G major triad."
    assert response.focus.role == "active"
    assert response.focus.notes[0].string == 6
    assert response.provider == "openai"
    assert response.model == "gpt-4o-mini"
    assert response.usage.input_tokens == 120
    assert response.usage.output_tokens == 30
    assert response.tool_call_count == 0
    assert response.status == "completed"
    assert response.latency_ms >= 0


def test_request_messages_place_stable_prefix_before_reconstructed_history_and_new_turn() -> None:
    model = ScriptedTutorModel(outcomes=[{"message": "ok", "focus": None}], usage_metadatas=[None])
    history = [
        TutorMessage(id="m1", tutor_thread_id="thread-1", role="user", content={"text": "earlier question"}, created_at="x"),
        TutorMessage(id="m2", tutor_thread_id="thread-1", role="assistant", content={"text": "earlier answer"}, created_at="x"),
    ]

    run_tutor_turn(
        branch=_branch(),
        artifact=None,
        history=history,
        user_message="new question",
        provider="openai",
        model="gpt-4o-mini",
        openai_api_key="k",
        model_factory=_factory_returning(model),
    )

    sent = model.calls[0]
    assert isinstance(sent[0], SystemMessage)  # stable prefix always first
    assert sent[1].content == "earlier question"
    assert sent[2].content == "earlier answer"
    assert sent[-1].content.rstrip().endswith("User: new question")  # volatile turn always last


def test_two_separately_constructed_agent_instances_preserve_branch_context() -> None:
    """Mirrors spec #10's stateless-runtime test: two independently built
    ScriptedTutorModel instances (nothing shared between "runs" except the
    plain persisted TutorMessage list) — the second call must still see the
    first turn's exchange."""
    branch = _branch()

    first_model = ScriptedTutorModel(
        outcomes=[{"message": "My favorite key is D major.", "focus": None}],
        usage_metadatas=[None],
    )
    first_response = run_tutor_turn(
        branch=branch,
        artifact=None,
        history=[],
        user_message="Remember: I like D major.",
        provider="openai",
        model="gpt-4o-mini",
        openai_api_key="k",
        model_factory=_factory_returning(first_model),
    )

    history_after_first_turn = [
        TutorMessage(id="m1", tutor_thread_id=branch.tutor_thread_id, role="user", content={"text": "Remember: I like D major."}, created_at="x"),
        TutorMessage(id="m2", tutor_thread_id=branch.tutor_thread_id, role="assistant", content={"text": first_response.message}, created_at="x"),
    ]

    second_model = ScriptedTutorModel(
        outcomes=[{"message": "You like D major.", "focus": None}],
        usage_metadatas=[None],
    )
    run_tutor_turn(
        branch=branch,
        artifact=None,
        history=history_after_first_turn,
        user_message="What key do I like?",
        provider="openai",
        model="gpt-4o-mini",
        openai_api_key="k",
        model_factory=_factory_returning(second_model),
    )

    second_call_text = " ".join(str(m.content) for m in second_model.calls[0])
    assert "D major" in second_call_text
    assert first_model is not second_model  # genuinely separate agent executions


def test_switching_provider_between_turns_does_not_lose_branch_context() -> None:
    """A provider swap between turns must not require migrating conversation
    state — the second (differently-provider'd) call still sees turn one's
    exchange, purely from V2's own persisted messages."""
    branch = _branch()
    history = [
        TutorMessage(id="m1", tutor_thread_id=branch.tutor_thread_id, role="user", content={"text": "I'm learning Little Wing."}, created_at="x"),
        TutorMessage(id="m2", tutor_thread_id=branch.tutor_thread_id, role="assistant", content={"text": "Great choice."}, created_at="x"),
    ]
    anthropic_model = ScriptedTutorModel(outcomes=[{"message": "Yes, Little Wing uses Em.", "focus": None}], usage_metadatas=[None])

    run_tutor_turn(
        branch=branch,
        artifact=None,
        history=history,
        user_message="What's the first chord?",
        provider="anthropic",
        model="claude-3-5-haiku-20241022",
        anthropic_api_key="k",
        model_factory=_factory_returning(anthropic_model),
    )

    sent_text = " ".join(str(m.content) for m in anthropic_model.calls[0])
    assert "Little Wing" in sent_text


def test_capability_error_is_a_typed_exception_not_a_generic_crash() -> None:
    model = ScriptedTutorModel(unsupported_tools=True)

    with pytest.raises(TutorCapabilityError):
        run_tutor_turn(
            branch=_branch(),
            artifact=None,
            history=[],
            user_message="hi",
            provider="openai",
            model="some-model-without-tools",
            openai_api_key="k",
            model_factory=_factory_returning(model),
        )


def test_missing_api_key_fails_before_any_model_call() -> None:
    calls: list[Any] = []

    def factory(provider, model_name, cache_key, **kwargs):
        calls.append(1)
        raise TutorCapabilityError("no key")

    with pytest.raises(TutorCapabilityError):
        run_tutor_turn(
            branch=_branch(),
            artifact=None,
            history=[],
            user_message="hi",
            provider="openai",
            model="gpt-4o-mini",
            model_factory=factory,
        )
    assert calls == [1]


def test_tool_call_count_excludes_the_structured_response_tool_itself() -> None:
    model = ScriptedTutorModel(outcomes=[{"message": "ok", "focus": None}], usage_metadatas=[None])

    response = run_tutor_turn(
        branch=_branch(),
        artifact=None,
        history=[],
        user_message="hi",
        provider="openai",
        model="gpt-4o-mini",
        openai_api_key="k",
        model_factory=_factory_returning(model),
    )

    # Zero domain tools this ticket — the only tool call made is the
    # structured-response schema tool, which must not count.
    assert response.tool_call_count == 0


def test_disabling_or_missing_cache_metrics_does_not_change_the_semantic_response() -> None:
    """Cache-behavior contract: whether the provider reports cache metrics
    at all must never change `message`/`focus`, only `usage`."""
    warm_model = ScriptedTutorModel(
        outcomes=[{"message": "Same answer either way.", "focus": None}],
        usage_metadatas=[
            {"input_tokens": 500, "output_tokens": 10, "total_tokens": 510, "input_token_details": {"cache_read": 400}}
        ],
    )
    cold_model = ScriptedTutorModel(
        outcomes=[{"message": "Same answer either way.", "focus": None}],
        usage_metadatas=[{"input_tokens": 500, "output_tokens": 10, "total_tokens": 510}],
    )

    warm_response = run_tutor_turn(
        branch=_branch(),
        artifact=None,
        history=[],
        user_message="hi",
        provider="openai",
        model="gpt-4o-mini",
        openai_api_key="k",
        model_factory=_factory_returning(warm_model),
    )
    cold_response = run_tutor_turn(
        branch=_branch(),
        artifact=None,
        history=[],
        user_message="hi",
        provider="openai",
        model="gpt-4o-mini",
        openai_api_key="k",
        model_factory=_factory_returning(cold_model),
    )

    assert warm_response.message == cold_response.message
    assert warm_response.focus == cold_response.focus
    assert warm_response.usage.cache_read_tokens == 400
    assert cold_response.usage.cache_read_tokens is None
