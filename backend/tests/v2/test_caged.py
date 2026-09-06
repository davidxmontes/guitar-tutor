"""Retained CAGED region helpers (ticket #101) — `caged_regions` and its
tuning-projecting wrapper `chord_caged_regions` survive the ConceptWorkspace
teardown for Harmony (H1) to reuse."""

from app.v2.concepts import caged_regions
from app.v2.workspace_caged import STANDARD_TUNING, chord_caged_regions


def test_caged_regions_are_the_five_shapes_with_complete_triads():
    regions = caged_regions("C", "major")
    assert [r.shape for r in regions] and {r.shape for r in regions} == {"C", "A", "G", "E", "D"}
    for region in regions:
        assert {p.interval for p in region.positions} == {"1", "3", "5"}


def test_neighbouring_caged_shapes_chain_by_a_shared_finger():
    regions = caged_regions("C", "major")
    first, second = regions[0], regions[1]
    shared = {(p.string, p.fret) for p in first.positions} & {(p.string, p.fret) for p in second.positions}
    assert shared


def test_chord_caged_regions_projects_into_an_alternate_tuning_with_spelling():
    drop_d = [64, 59, 55, 50, 45, 38]
    regions = chord_caged_regions("F#", "major", drop_d)
    assert {p["note"] for region in regions for p in region["positions"]} == {"F#", "A#", "C#"}
    assert all(p["midi"] == drop_d[p["string"] - 1] + p["fret"] for region in regions for p in region["positions"])


def test_chord_caged_regions_in_standard_tuning_matches_the_trusted_positions():
    regions = chord_caged_regions("C", "major", STANDARD_TUNING)
    trusted = caged_regions("C", "major")
    got = [[(p["string"], p["fret"]) for p in region["positions"]] for region in regions]
    want = [[(p.string, p.fret) for p in region.positions] for region in trusted]
    assert got == want


def test_minor_caged_regions_spell_the_minor_triad():
    regions = chord_caged_regions("C", "minor", STANDARD_TUNING)
    assert {p["note"] for region in regions for p in region["positions"]} == {"C", "Eb", "G"}
