"""Tutor contract tests (ticket #13): the semantic TutorResponse/TutorFocus
shape accepts arbitrary valid string/fret groups and an open-ended semantic
role, without any layout/navigation instruction fields."""

from app.v2.tutor.contract import FretPosition, TutorFocus, TutorResponse, TutorUsage


def test_focus_accepts_arbitrary_string_fret_pairs_with_no_canonical_entry() -> None:
    focus = TutorFocus(
        role="candidate",
        notes=[FretPosition(string=6, fret=13), FretPosition(string=2, fret=1)],
        label="An unusual voicing",
    )

    assert [n.fret for n in focus.notes] == [13, 1]


def test_focus_role_is_free_form_not_a_closed_enum() -> None:
    # Spec vocabulary (context/active/upcoming/candidate/target/comparison)
    # plus an invented role neither of those name — both must validate.
    for role in ("context", "active", "upcoming", "candidate", "target", "comparison", "a-brand-new-role"):
        assert TutorFocus(role=role).role == role


def test_focus_has_no_layout_or_navigation_fields() -> None:
    fields = set(TutorFocus.model_fields)
    assert fields == {"role", "notes", "label"}


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
    response = TutorResponse(
        message="Just an answer, no focus needed.",
        provider="openai",
        model="gpt-4o-mini",
        latency_ms=10,
        usage=TutorUsage(),
        tool_call_count=0,
    )

    assert response.focus is None
