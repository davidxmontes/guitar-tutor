from app.music.chords import CHORD_INTERVALS
from app.music.chords_db import QUALITY_TO_SUFFIX, get_voicing_positions, has_chord

VALID_ROOTS = [
    "C",
    "C#",
    "Db",
    "D",
    "D#",
    "Eb",
    "E",
    "F",
    "F#",
    "Gb",
    "G",
    "G#",
    "Ab",
    "A",
    "A#",
    "Bb",
    "B",
]


def _intervals_for(root: str, quality: str) -> set[str]:
    voicings = get_voicing_positions(root, quality)
    assert voicings is not None
    return {
        pos["interval"]
        for voicing in voicings
        for pos in voicing["positions"]
    }


def test_quality_mapping_has_coverage() -> None:
    for quality in QUALITY_TO_SUFFIX:
        assert any(has_chord(root, quality) for root in VALID_ROOTS), quality


def test_enharmonic_normalization_sharps_map_to_db_keys() -> None:
    assert has_chord("D#", "minor7")
    assert has_chord("A#", "major7")
    assert has_chord("Gb", "dominant7")


def test_interval_labels_are_quality_aware() -> None:
    assert _intervals_for("C", "major") <= {"1", "3", "5"}

    dim7_intervals = _intervals_for("C", "dim7")
    assert "bb7" in dim7_intervals
    assert "6" not in dim7_intervals

    nine_intervals = _intervals_for("C", "9")
    assert "9" in nine_intervals
    assert "2" not in nine_intervals

    add9_intervals = _intervals_for("C", "add9")
    assert "9" in add9_intervals
    assert "2" not in add9_intervals


def test_missing_quality_returns_none() -> None:
    assert get_voicing_positions("C", "nonexistent") is None


def test_known_open_c_major_voicing_frets() -> None:
    voicings = get_voicing_positions("C", "major")
    assert voicings is not None

    expected = {(5, 3), (4, 2), (3, 0), (2, 1), (1, 0)}
    found = False
    for voicing in voicings:
        played = {(p["string"], p["fret"]) for p in voicing["positions"]}
        if expected.issubset(played):
            found = True
            break

    assert found


def test_open_shape_positions_are_replicated_at_plus_12_frets() -> None:
    voicings = get_voicing_positions("C", "major")
    assert voicings is not None

    open_shape = {(5, 3), (4, 2), (3, 0), (2, 1), (1, 0)}
    found = False

    for voicing in voicings:
        played = {(p["string"], p["fret"]) for p in voicing["positions"]}
        if open_shape.issubset(played):
            for string, fret in open_shape:
                assert (string, fret + 12) in played
            found = True
            break

    assert found


def test_all_supported_qualities_exist_for_all_valid_roots() -> None:
    for root in VALID_ROOTS:
        for quality in CHORD_INTERVALS:
            assert has_chord(root, quality), f"missing {root} {quality}"
