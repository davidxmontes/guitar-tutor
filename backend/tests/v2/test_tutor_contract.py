"""Tutor contract tests (ticket #13): the semantic TutorResponse/TutorFocus
shape accepts arbitrary valid string/fret groups and an open-ended semantic
role, without any layout/navigation instruction fields."""

import pytest
from pydantic import ValidationError

from app.v2.models import ProgressionChord, ProgressionPayload
from app.v2.concepts import build_concept_study
from app.v2.tutor.contract import (
    ConceptSuggestion,
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
    # Spec vocabulary (context/active/upcoming/candidate/target/comparison)
    # plus an invented role neither of those name — both must validate.
    for role in ("context", "active", "upcoming", "candidate", "target", "comparison", "a-brand-new-role"):
        assert TutorFocus(role=role).role == role


def test_focus_has_no_layout_or_navigation_fields() -> None:
    fields = set(TutorFocus.model_fields)
    assert fields == {"role", "notes", "label", "groups"}


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


def test_concept_suggestion_is_semantic_and_never_a_navigation_command() -> None:
    suggestion = ConceptSuggestion(concept_id="pentatonic_minor", root="A", label="A minor pentatonic")

    assert suggestion.model_dump() == {
        "concept_id": "pentatonic_minor",
        "root": "A",
        "label": "A minor pentatonic",
    }
    assert "navigate" not in ConceptSuggestion.model_fields


def test_tutor_response_can_offer_a_concept_without_opening_it() -> None:
    response = TutorResponse(
        message="That phrase uses A minor pentatonic.",
        concept_suggestion=ConceptSuggestion(
            concept_id="pentatonic_minor",
            root="A",
            label="A minor pentatonic",
        ),
        provider="openai",
        model="gpt-4o-mini",
        latency_ms=10,
        usage=TutorUsage(),
        tool_call_count=0,
    )

    assert response.concept_suggestion.label == "A minor pentatonic"


def test_tutor_cannot_offer_an_unsupported_concept_visualization() -> None:
    with pytest.raises(ValidationError):
        TutorTerminal(
            message="I can explain this without opening an empty study.",
            concept_suggestion={"concept_id": "whole_tone", "root": "C", "label": "C whole tone"},
        )


def test_tutor_can_offer_only_publicly_supported_chord_studies() -> None:
    suggestion = ConceptSuggestion(
        concept_id="chord_m9",
        root="C",
        label="C minor 9",
    )

    assert suggestion.concept_id == "chord_m9"
    with pytest.raises(ValidationError):
        ConceptSuggestion(concept_id="chord_power", root="C", label="C power chord")


def test_tutor_can_offer_caged_only_as_a_supported_physical_visualization() -> None:
    suggestion = ConceptSuggestion(concept_id="caged", root="C", label="C major CAGED")
    visualization = build_concept_study(suggestion.root, suggestion.concept_id)

    assert len(visualization.regions) == 5
    assert all(region.positions for region in visualization.regions)


def test_tutor_terminal_candidates_hold_symbolic_chords_only() -> None:
    """LLM-facing schema: a candidate is title + root/quality chords, no
    voicing/tuning fields at all -- the model has no way to invent physical
    positions here (see runner.py for who resolves them)."""

    terminal = TutorTerminal(
        message="Here are a couple of ideas.",
        candidates=[
            ProgressionCandidate(
                title="Wistful I-vi-IV-V",
                chords=[
                    ProgressionChordIdea(root="C", quality="major"),
                    ProgressionChordIdea(root="A", quality="minor"),
                ],
            )
        ],
    )

    assert set(ProgressionChordIdea.model_fields) == {"root", "quality"}
    assert terminal.candidates[0].chords[0].root == "C"


def test_tutor_response_candidates_default_to_none_and_carry_resolved_progressions() -> None:
    response = TutorResponse(
        message="Here's an idea inspired by this passage.",
        candidates=[
            ProgressionPayload(
                title="Wistful I-vi-IV-V",
                chords=[
                    ProgressionChord(root="C", quality="major", voicing=[{"string": 1, "fret": 0}], tuning="standard"),
                    ProgressionChord(root="X", quality="not-a-real-quality"),
                ],
                inspired_by={"artifact_id": "a1", "artifact_kind": "song_study"},
            )
        ],
        provider="openai",
        model="gpt-4o-mini",
        latency_ms=10,
        usage=TutorUsage(),
        tool_call_count=0,
    )

    assert response.candidates[0].chords[0].voicing[0].fret == 0
    # A chord with no curated voicing is expected, not an error.
    assert response.candidates[0].chords[1].voicing is None

    no_candidates = TutorResponse(
        message="Just an answer.", provider="openai", model="gpt-4o-mini", latency_ms=1, usage=TutorUsage(), tool_call_count=0
    )
    assert no_candidates.candidates is None
