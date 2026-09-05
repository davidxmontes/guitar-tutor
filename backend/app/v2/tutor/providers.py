"""Provider adapters for the V2 stateless tutor (ticket #13).

One fresh LangChain chat model is constructed per call, per provider
(`build_tutor_model`) — never reused across requests, never carrying
conversation state. Prompt caching is wired in per provider as a pure
latency/cost optimization (spec #10: "never a memory mechanism"):

- OpenAI: `prompt_cache_key` (a stable, branch-derived affinity hint) via
  `model_kwargs` — the exact kwarg langchain-openai forwards straight
  through to the Responses/Chat Completions API.
- Anthropic: no model-level cache kwarg here. langchain-anthropic's
  `cache_control` model_kwarg attaches to whichever message happens to be
  *last* in the request (see `_get_request_payload` in
  langchain_anthropic/chat_models.py) — on a fresh stateless turn that is
  always the volatile per-turn content, never the stable system prompt.
  Instead, app.v2.tutor.prompt.stable_system_message builds the stable
  instructions as a SystemMessage whose content is a list of blocks with an
  explicit `cache_control` breakpoint on the stable block itself — the
  mechanism langchain-anthropic actually preserves end-to-end
  (`_format_messages` passes a dict block's `cache_control` key straight
  through to Anthropic's `system` field).
- OpenRouter (via `ChatOpenAI` + `base_url`, matching V1's existing
  OpenRouter-through-ChatOpenAI pattern — no new package): a stable
  Branch-derived `session_id` for OpenRouter's own sticky-routing/prompt-cache
  affinity, plus `provider: {"allow_fallbacks": False, "require_parameters":
  True}` so a fallback route can't silently drop a requested parameter.

None of these identifiers are ever read back as conversation state — see
runner.py, which reconstructs the full message list from V2's own
persisted TutorMessage rows on every call, independent of whatever any
provider did with its cache.
"""

from typing import Any, Optional

from langchain_anthropic import ChatAnthropic
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage
from langchain_openai import ChatOpenAI

from app.v2.tutor.contract import TutorUsage

TUTOR_PROVIDERS: tuple[str, ...] = ("openai", "anthropic", "openrouter")

_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

_OPENROUTER_PROVIDER_ROUTING: dict[str, Any] = {
    "allow_fallbacks": False,
    "require_parameters": True,
}


class TutorCapabilityError(Exception):
    """Raised when the configured tutor provider/model can't satisfy a
    capability the tutor requires (at minimum: tool calling — the
    structured `TutorTerminal` response is itself delivered via a tool
    call, so this covers "no tool calling" for every provider/model, with
    zero domain tools or not) — or when its API key isn't configured.
    Fails clearly at run setup / on first model call rather than degrading
    silently mid-loop.
    """


def build_tutor_model(
    provider: str,
    model: str,
    cache_key: str,
    *,
    openai_api_key: Optional[str] = None,
    anthropic_api_key: Optional[str] = None,
    openrouter_api_key: Optional[str] = None,
) -> BaseChatModel:
    """Construct exactly one fresh chat model for `provider`/`model`, with
    that provider's own cache-affinity mechanism wired to `cache_key`
    (the Branch's `tutor_thread_id` — stable across turns, never itself a
    conversation-memory primitive)."""

    if provider == "openai":
        if not openai_api_key:
            raise TutorCapabilityError("OPENAI_API_KEY is not configured for the V2 tutor")
        return ChatOpenAI(
            model=model,
            api_key=openai_api_key,
            model_kwargs={"prompt_cache_key": cache_key},
        )

    if provider == "anthropic":
        if not anthropic_api_key:
            raise TutorCapabilityError("ANTHROPIC_API_KEY is not configured for the V2 tutor")
        return ChatAnthropic(model=model, api_key=anthropic_api_key)

    if provider == "openrouter":
        if not openrouter_api_key:
            raise TutorCapabilityError("OPENROUTER_API_KEY is not configured for the V2 tutor")
        return ChatOpenAI(
            model=model,
            api_key=openrouter_api_key,
            base_url=_OPENROUTER_BASE_URL,
            extra_body={
                "session_id": cache_key,
                "provider": _OPENROUTER_PROVIDER_ROUTING,
            },
        )

    raise TutorCapabilityError(f"Unknown V2 tutor provider: {provider!r}")


def usage_from_ai_message(message: AIMessage) -> TutorUsage:
    """Normalize LangChain's own provider-agnostic `usage_metadata` — already
    populated the same way regardless of whether the underlying model is
    ChatOpenAI, ChatAnthropic, or OpenRouter-via-ChatOpenAI — into
    `TutorUsage`. A metric absent from `usage_metadata` stays `None`, never
    fabricated as 0: OpenAI/OpenRouter never populate
    `input_token_details.cache_creation` (no cache-write concept), while
    Anthropic populates both `cache_read` and `cache_creation`.
    """

    metadata: dict[str, Any] = message.usage_metadata or {}
    input_details: dict[str, Any] = metadata.get("input_token_details") or {}
    output_details: dict[str, Any] = metadata.get("output_token_details") or {}

    cache_read = input_details.get("cache_read")
    cache_write = input_details.get("cache_creation")
    input_tokens = int(metadata.get("input_tokens", 0) or 0)

    return TutorUsage(
        input_tokens=input_tokens,
        output_tokens=int(metadata.get("output_tokens", 0) or 0),
        cache_read_tokens=cache_read,
        cache_write_tokens=cache_write,
        uncached_input_tokens=(
            input_tokens - (cache_read or 0) - (cache_write or 0)
            if cache_read is not None or cache_write is not None
            else None
        ),
        reasoning_tokens=output_details.get("reasoning"),
    )
