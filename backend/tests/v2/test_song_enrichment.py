from app.v2.song_enrichment import build_enrichment_context, run_song_enrichment
from tests.v2.tutor_fakes import ScriptedTutorModel


TAB_DATA = {
    "measures": [
        {
            "marker": {"text": "Intro"},
            "voices": [{"beats": [{"chord": {"text": "Gsus4"}, "notes": [{"string": 0, "fret": 3, "accentuated": True}]}]}],
        },
        {"voices": [{"beats": [{"chord": {"text": "G"}, "notes": [{"string": 0, "fret": 3}]}]}]},
        {
            "marker": {"text": "Verse"},
            "voices": [{"beats": [{"chord": {"text": "Em"}, "notes": [{"string": 1, "fret": 0}]}]}],
        },
    ]
}
CHORDPRO = "{section: Intro}\n[G]Hello [C]world\n{section: Verse}\n[Em]Today"


def test_enrichment_context_summarizes_and_fingerprints_raw_sources() -> None:
    context = build_enrichment_context(TAB_DATA, CHORDPRO)

    assert context["measure_count"] == 3
    assert context["source_sections"] == [
        {"label": "Intro", "start_measure": 1, "end_measure": 2, "source": "tab"},
        {"label": "Verse", "start_measure": 3, "end_measure": 3, "source": "tab"},
    ]
    assert context["measures"][0]["chords"] == ["Gsus4"]
    assert context["measures"][0]["positions"] == ["0:3"]
    assert context["chordpro_lines"][0] == {"section": "Intro"}
    assert context["chordpro_lines"][1] == {"chords": ["G", "C"], "lyrics": "Hello world"}
    assert len(context["tab_fingerprint"]) == 64
    assert len(context["chordpro_fingerprint"]) == 64


def test_run_song_enrichment_marks_model_ranges_as_ai_and_keeps_semantic_levels() -> None:
    model = ScriptedTutorModel(
        outcomes=[
            {
                "ranges": [
                    {
                        "start_measure": 1,
                        "end_measure": 2,
                        "section": "Intro",
                        "lyrics": ["Hello world"],
                        "broad_harmony": ["G"],
                        "detailed_harmony": ["Gsus4", "G"],
                        "confidence": "medium",
                    }
                ]
            }
        ]
    )

    enrichment = run_song_enrichment(
        artifact_id="artifact-1",
        tab_data=TAB_DATA,
        chordpro=CHORDPRO,
        provider="openai",
        model="fake",
        openai_api_key="k",
        model_factory=lambda *_args, **_kwargs: model,
    )

    assert enrichment.ranges[0].provenance == "ai"
    assert enrichment.ranges[0].confidence == "medium"
    assert enrichment.ranges[0].broad_harmony == ["G"]
    assert enrichment.ranges[0].detailed_harmony == ["Gsus4", "G"]
    assert enrichment.source_sections[0].source == "tab"
    prompt = " ".join(str(message.content) for message in model.calls[0])
    assert enrichment.tab_fingerprint in prompt
    assert "accentuated" not in prompt


def test_run_song_enrichment_rejects_ranges_outside_the_raw_track() -> None:
    model = ScriptedTutorModel(
        outcomes=[
            {
                "ranges": [
                    {
                        "start_measure": 1,
                        "end_measure": 99,
                        "section": "Everything",
                        "lyrics": [],
                        "broad_harmony": [],
                        "detailed_harmony": [],
                        "confidence": "low",
                    }
                ]
            }
        ]
    )

    try:
        run_song_enrichment(
            artifact_id="artifact-1",
            tab_data=TAB_DATA,
            chordpro=CHORDPRO,
            provider="openai",
            model="fake",
            openai_api_key="k",
            model_factory=lambda *_args, **_kwargs: model,
        )
    except ValueError as exc:
        assert "outside the 3-measure track" in str(exc)
    else:
        raise AssertionError("Expected invalid AI range to be rejected")
