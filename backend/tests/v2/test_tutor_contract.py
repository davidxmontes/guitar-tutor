"""Tutor contract tests: the semantic TutorResponse/TutorFocus shape accepts
arbitrary valid string/fret groups and an open-ended semantic role, with no
layout/navigation instruction fields.

Ticket #101: ConceptSuggestion, workspace_patch, and the artifact-bound
voicing/exercise suggestions are removed; symbolic progression candidates
and physical comparison groups remain.
"""

from app.v2.models import ProgressionChord, ProgressionPayload
from app.v2.tutor.contract import (
    FretPosition,
    ProgressionCandidate,
    ProgressionChordIdea,
    TutorFocus,
    TutorResponse,
    TutorTerminal,
    TutorUsage,
)


def test_focus_accepts_arbitrary_string_fret_pairs_with_no_canonical_entry() -> None:
    focus = TutorFocus(
        role="candidate",
        notes=[FretPosition(string=6, fret=13), FretPosition(string=2, fret=1)],
        label="An unusual voicing",
    )
    assert [n.fret for n in focus.notes] == [13, 1]


def test_focus_role_is_free_form_not_a_closed_enum() -> None:
    for role in ("context", "active", "upcoming", "candidate", "target", "comparison", "a-brand-new-role"):
        assert TutorFocus(role=role).role == role


def test_focus_has_no_layout_or_navigation_fields() -> None:
    assert set(TutorFocus.model_fields) == {"role", "notes", "label"}


def test_tutor_terminal_has_no_conceptworkspace_or_concept_promotion_fields() -> None:
    for gone in ("workspace_patch", "concept_suggestion", "voicing_candidates", "exercise_suggestion"):
        assert gone not in TutorTerminal.model_fields
        assert gone not in TutorResponse.model_fields


def test_tutor_response_serializes_full_observability() -> None:
    response = TutorResponse(
        message="Here's how the passage works.",
        focus=TutorFocus(role="active", notes=[FretPosition(string=1, fret=0)]),
        provider="anthropic",
        model="claude-3-5-haiku-20241022",
        latency_ms=842,
        usage=TutorUsage(input_tokens=100, output_tokens=20, cache_read_tokens=50),
        tool_call_count=0,
    )
    dumped = response.model_dump()
    assert dumped["provider"] == "anthropic"
    assert dumped["latency_ms"] == 842
    assert dumped["usage"]["cache_read_tokens"] == 50
    assert dumped["usage"]["cache_write_tokens"] is None
    assert dumped["status"] == "completed"


def test_tutor_response_focus_is_optional() -> None:
    response = TutorResponse(message="Just an answer.", provider="openai", model="gpt-4o-mini",
                             latency_ms=10, usage=TutorUsage(), tool_call_count=0)
    assert response.focus is None


def test_tutor_terminal_candidates_hold_symbolic_chords_only() -> None:
    terminal = TutorTerminal(
        message="Here are a couple of ideas.",
        candidates=[ProgressionCandidate(title="Wistful I-vi-IV-V", chords=[
            ProgressionChordIdea(root="C", quality="major"),
            ProgressionChordIdea(root="A", quality="minor"),
        ])],
    )
    assert set(ProgressionChordIdea.model_fields) == {"root", "quality"}
    assert terminal.candidates[0].chords[0].root == "C"


def test_tutor_response_candidates_default_to_none_and_carry_resolved_progressions() -> None:
    response = TutorResponse(
        message="Here's an idea inspired by this passage.",
        candidates=[ProgressionPayload(title="Wistful I-vi-IV-V", chords=[
            ProgressionChord(root="C", quality="major", voicing=[{"string": 1, "fret": 0}], tuning="standard"),
            ProgressionChord(root="X", quality="not-a-real-quality"),
        ], inspired_by=None)],
        provider="openai", model="gpt-4o-mini", latency_ms=10, usage=TutorUsage(), tool_call_count=0,
    )
    assert response.candidates[0].chords[0].voicing[0].fret == 0
    assert response.candidates[0].chords[1].voicing is None

    no_candidates = TutorResponse(message="Just an answer.", provider="openai", model="gpt-4o-mini",
                                  latency_ms=1, usage=TutorUsage(), tool_call_count=0)
    assert no_candidates.candidates is None
