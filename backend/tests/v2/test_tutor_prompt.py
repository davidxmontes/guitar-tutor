"""Prompt-layout tests (ticket #13): the stable tutor prefix serializes
deterministically, volatile Branch/message data is assembled after it, and
history reconstruction round-trips role -> LangChain message type purely
from persisted TutorMessage rows (no checkpointer involved).

Ticket #101: the Branch carries workspace state, not a linked Artifact; the
ConceptWorkspace patch instructions and concept-promotion prose are gone.
"""

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage

from app.v2.models import Branch, HarmonyExploration, ProgressionWorkspaceState, TutorMessage
from app.v2.tutor.prompt import reconstruct_history, stable_system_message, volatile_turn_message


def _branch(**overrides) -> Branch:
    fields = dict(
        id="b1",
        session_id="s1",
        tutor_thread_id="thread-1",
        harmony_exploration=HarmonyExploration(),
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
    assert anthropic_message.content[0]["text"] == openai_message.content


def test_stable_prompt_has_no_conceptworkspace_or_concept_promotion_prose() -> None:
    text = str(stable_system_message("openai").content)

    assert "concept_suggestion" not in text
    assert "workspace_patch" not in text
    assert "ConceptWorkspace" not in text


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


def test_volatile_turn_message_carries_active_workspace_state_and_user_text() -> None:
    branch = _branch(
        progression_workspace=ProgressionWorkspaceState(ideas=[{"id": "i1", "label": "Idea"}], active_idea_id="i1"),
        active_workspace="progression",
    )

    message = volatile_turn_message(branch=branch, user_message="What comes next?",
                                    siblings=[{"id": "b2", "title": "Harmony branch", "active_workspace": "harmony"}])

    text = message.content
    assert "Active workspace: progression" in text
    assert '"active_idea_id":"i1"' in text.replace(" ", "")
    assert "Harmony branch" in text
    assert text.rstrip().endswith("User: What comes next?")


def test_volatile_turn_message_handles_an_empty_harmony_exploration() -> None:
    message = volatile_turn_message(branch=_branch(), user_message="hi")

    assert "Active workspace: harmony" in message.content
    assert '"scratch":[]' in message.content.replace(" ", "")


def test_reconstruct_history_makes_a_prior_turns_candidates_addressable() -> None:
    messages = [
        TutorMessage(id="m1", tutor_thread_id="t1", role="user", content={"text": "make me something wistful"}, created_at="x"),
        TutorMessage(
            id="m2",
            tutor_thread_id="t1",
            role="assistant",
            content={
                "text": "Here are two ideas.",
                "focus": None,
                "candidates": [
                    {"title": "Wistful I-vi-IV-V", "chords": [{"root": "C", "quality": "major", "voicing": None, "tuning": None}], "inspired_by": None},
                    {"title": "Moody ii-V-I", "chords": [{"root": "D", "quality": "minor", "voicing": None, "tuning": None}], "inspired_by": None},
                ],
            },
            created_at="x",
        ),
    ]

    reconstructed = reconstruct_history(messages)

    assistant_text = reconstructed[1].content
    assert "Here are two ideas." in assistant_text
    assert "Wistful I-vi-IV-V" in assistant_text
    assert "Moody ii-V-I" in assistant_text
    assert "Cmajor" in assistant_text


def test_reconstruct_history_assistant_message_with_no_candidates_is_unchanged() -> None:
    messages = [
        TutorMessage(id="m1", tutor_thread_id="t1", role="assistant", content={"text": "Just an answer.", "focus": None}, created_at="x"),
    ]

    reconstructed = reconstruct_history(messages)

    assert reconstructed[0].content == "Just an answer."
