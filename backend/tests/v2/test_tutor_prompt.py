"""Prompt-layout tests (ticket #13): the stable tutor prefix serializes
deterministically, volatile Branch/Artifact/message data is assembled after
it, and history reconstruction round-trips role -> LangChain message type
purely from persisted TutorMessage rows (no checkpointer involved).
"""

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage

from app.v2.models import Artifact, Branch, TutorMessage
from app.v2.tutor.prompt import reconstruct_history, stable_system_message, volatile_turn_message


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


def test_stable_system_message_is_byte_identical_across_calls_for_non_anthropic() -> None:
    first = stable_system_message("openai")
    second = stable_system_message("openrouter")

    assert isinstance(first, SystemMessage)
    assert first.content == second.content
    assert isinstance(first.content, str)


def test_stable_system_message_carries_cache_control_only_for_anthropic() -> None:
    anthropic_message = stable_system_message("anthropic")
    openai_message = stable_system_message("openai")

    assert isinstance(anthropic_message.content, list)
    assert anthropic_message.content[0]["cache_control"] == {"type": "ephemeral"}
    # Same instructions text either way — only the cache breakpoint differs.
    assert anthropic_message.content[0]["text"] == openai_message.content


def test_stable_prompt_keeps_concept_promotion_explicit() -> None:
    text = str(stable_system_message("openai").content)

    assert "concept_suggestion" in text
    assert "must never open" in text


def test_reconstruct_history_maps_roles_to_langchain_message_types() -> None:
    messages = [
        TutorMessage(id="m1", tutor_thread_id="t1", role="user", content={"text": "hello"}, created_at="x"),
        TutorMessage(id="m2", tutor_thread_id="t1", role="assistant", content={"text": "hi there"}, created_at="x"),
        TutorMessage(
            id="m3",
            tutor_thread_id="t1",
            role="tool",
            content={"text": "42", "tool_call_id": "call-1", "name": "some_tool"},
            created_at="x",
        ),
    ]

    reconstructed = reconstruct_history(messages)

    assert isinstance(reconstructed[0], HumanMessage) and reconstructed[0].content == "hello"
    assert isinstance(reconstructed[1], AIMessage) and reconstructed[1].content == "hi there"
    assert isinstance(reconstructed[2], ToolMessage)
    assert reconstructed[2].content == "42"
    assert reconstructed[2].tool_call_id == "call-1"


def test_volatile_turn_message_includes_song_study_selection_focus_and_user_text() -> None:
    branch = _branch(selection={"range": [0, 4]}, focus={"target": "chord-2"})
    artifact = Artifact(
        id="a1",
        user_id="u1",
        kind="song_study",
        title="Song",
        payload={
            "song_id": 1,
            "artist": "Artist",
            "title": "Title",
            "track": {"index": 0, "name": "Guitar", "instrument": "guitar", "tuning": [4, 9, 2, 7, 11, 4]},
            "tab_data": {"measures": [{}, {}]},
        },
        created_at="x",
        updated_at="x",
    )

    message = volatile_turn_message(branch=branch, artifact=artifact, user_message="What chord is this?")

    text = message.content
    assert "Artist - Title" in text
    assert "Measure count: 2" in text
    assert '"range":[0,4]' in text.replace(" ", "")  # selection present
    assert text.rstrip().endswith("User: What chord is this?")


def test_volatile_turn_message_handles_no_artifact() -> None:
    branch = _branch()

    message = volatile_turn_message(branch=branch, artifact=None, user_message="hi")

    assert "Current artifact: None" in message.content
    assert "Selection: None" in message.content
    assert "Focus: None" in message.content
