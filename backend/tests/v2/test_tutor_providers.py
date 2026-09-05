"""Provider-adapter tests (ticket #13): construction/caching-kwarg contract
per provider, capability/config failure, and usage normalization. No real
network call anywhere — ChatOpenAI/ChatAnthropic are monkeypatched to a
recording constructor, same pattern as enzo-ai's provider-contract tests.
"""

from typing import Any

import pytest
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage

import app.v2.tutor.providers as providers_module
from app.v2.tutor.providers import TutorCapabilityError, build_tutor_model, usage_from_ai_message


class _RecordingModel(BaseChatModel):
    @property
    def _llm_type(self) -> str:
        return "recording"

    def _generate(self, *args: Any, **kwargs: Any):  # pragma: no cover - never called
        raise AssertionError("no real generation in a provider-construction test")


def _recording_constructor(calls: list[dict[str, Any]]):
    def constructor(**kwargs: Any) -> BaseChatModel:
        calls.append(kwargs)
        return _RecordingModel()

    return constructor


# --- build_tutor_model: construction + per-provider cache wiring ------------


def test_openai_model_carries_prompt_cache_key(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[dict[str, Any]] = []
    monkeypatch.setattr(providers_module, "ChatOpenAI", _recording_constructor(calls))

    build_tutor_model("openai", "gpt-4o-mini", "thread-123", openai_api_key="k")

    assert len(calls) == 1
    assert calls[0]["model"] == "gpt-4o-mini"
    assert calls[0]["api_key"] == "k"
    assert calls[0]["model_kwargs"] == {"prompt_cache_key": "thread-123"}
    assert "base_url" not in calls[0]


def test_anthropic_model_carries_no_model_level_cache_kwarg(monkeypatch: pytest.MonkeyPatch) -> None:
    """Anthropic's cache_control breakpoint lives on the stable system
    message's content block (app.v2.tutor.prompt.stable_system_message), not
    here — a model_kwarg would land on the *last* message in the request,
    which is always the volatile per-turn content on a fresh stateless turn.
    """
    calls: list[dict[str, Any]] = []
    monkeypatch.setattr(providers_module, "ChatAnthropic", _recording_constructor(calls))

    build_tutor_model("anthropic", "claude-3-5-haiku-20241022", "thread-123", anthropic_api_key="k")

    assert len(calls) == 1
    assert calls[0]["model"] == "claude-3-5-haiku-20241022"
    assert calls[0]["api_key"] == "k"
    assert "model_kwargs" not in calls[0]


def test_openrouter_model_carries_session_id_and_provider_routing(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[dict[str, Any]] = []
    monkeypatch.setattr(providers_module, "ChatOpenAI", _recording_constructor(calls))

    build_tutor_model("openrouter", "minimax/minimax-m2.5", "thread-123", openrouter_api_key="k")

    assert len(calls) == 1
    assert calls[0]["base_url"] == "https://openrouter.ai/api/v1"
    assert calls[0]["extra_body"]["session_id"] == "thread-123"
    assert calls[0]["extra_body"]["provider"] == {"allow_fallbacks": False, "require_parameters": True}


def test_openrouter_session_id_is_the_branch_derived_cache_key_stable_across_turns(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[dict[str, Any]] = []
    monkeypatch.setattr(providers_module, "ChatOpenAI", _recording_constructor(calls))

    build_tutor_model("openrouter", "minimax/minimax-m2.5", "branch-thread-abc", openrouter_api_key="k")
    build_tutor_model("openrouter", "minimax/minimax-m2.5", "branch-thread-abc", openrouter_api_key="k")

    assert calls[0]["extra_body"]["session_id"] == calls[1]["extra_body"]["session_id"] == "branch-thread-abc"


@pytest.mark.parametrize(
    ("provider", "kwargs"),
    [
        ("openai", {"openai_api_key": None}),
        ("anthropic", {"anthropic_api_key": None}),
        ("openrouter", {"openrouter_api_key": None}),
    ],
)
def test_missing_api_key_raises_tutor_capability_error(provider: str, kwargs: dict[str, Any]) -> None:
    with pytest.raises(TutorCapabilityError):
        build_tutor_model(provider, "some-model", "thread-1", **kwargs)


def test_unknown_provider_raises_tutor_capability_error() -> None:
    with pytest.raises(TutorCapabilityError):
        build_tutor_model("not-a-real-provider", "model", "thread-1")


# --- usage_from_ai_message: normalization per provider shape ----------------


def test_anthropic_usage_maps_cache_reads_writes_and_uncached_input() -> None:
    message = AIMessage(
        content="",
        usage_metadata={
            "input_tokens": 500,
            "output_tokens": 40,
            "total_tokens": 540,
            "input_token_details": {"cache_read": 300, "cache_creation": 150},
        },
    )

    usage = usage_from_ai_message(message)

    assert usage.input_tokens == 500
    assert usage.output_tokens == 40
    assert usage.cache_read_tokens == 300
    assert usage.cache_write_tokens == 150
    assert usage.uncached_input_tokens == 50  # 500 - 300 - 150
    assert usage.reasoning_tokens is None


def test_openai_usage_maps_cached_input_and_reasoning_output_with_no_cache_write() -> None:
    message = AIMessage(
        content="",
        usage_metadata={
            "input_tokens": 1000,
            "output_tokens": 200,
            "total_tokens": 1200,
            "input_token_details": {"cache_read": 800},
            "output_token_details": {"reasoning": 50},
        },
    )

    usage = usage_from_ai_message(message)

    assert usage.input_tokens == 1000
    assert usage.cache_read_tokens == 800
    assert usage.cache_write_tokens is None  # OpenAI never reports cache writes
    assert usage.uncached_input_tokens == 200
    assert usage.reasoning_tokens == 50


def test_openrouter_usage_leaves_every_breakdown_unavailable_with_no_cache_detail() -> None:
    message = AIMessage(
        content="",
        usage_metadata={"input_tokens": 300, "output_tokens": 60, "total_tokens": 360},
    )

    usage = usage_from_ai_message(message)

    assert usage.input_tokens == 300
    assert usage.output_tokens == 60
    assert usage.cache_read_tokens is None
    assert usage.cache_write_tokens is None
    assert usage.uncached_input_tokens is None
    assert usage.reasoning_tokens is None


def test_usage_from_ai_message_handles_missing_usage_metadata_entirely() -> None:
    message = AIMessage(content="")

    usage = usage_from_ai_message(message)

    assert usage.input_tokens == 0
    assert usage.output_tokens == 0
    assert usage.cache_read_tokens is None
