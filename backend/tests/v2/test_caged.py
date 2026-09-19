"""Trusted CAGED shapes as resolved for Harmony, including alternate tuning."""

import pytest
from app.v2.workspace_caged import STANDARD_TUNING, chord_caged_regions


@pytest.mark.parametrize('root', ['C', 'Db', 'F#', 'Bb'])
@pytest.mark.parametrize('quality', ['major', 'minor'])
def test_caged_regions_are_the_five_shapes_with_complete_triads(root, quality):
    regions = chord_caged_regions(root, quality, STANDARD_TUNING)
    assert len(regions) == 5 and {r['shape'] for r in regions} == set('CAGED')
    for region in regions:
        assert {p['degree'] for p in region['positions']} == {'1', '3' if quality == 'major' else 'b3', '5'}


def test_neighbouring_caged_shapes_chain_by_a_shared_finger():
    regions = chord_caged_regions("C", "major", STANDARD_TUNING)
    first, second = regions[0], regions[1]
    shared = {(p['string'], p['fret']) for p in first['positions']} & {(p['string'], p['fret']) for p in second['positions']}
    assert shared


def test_chord_caged_regions_projects_into_an_alternate_tuning_with_spelling():
    drop_d = [64, 59, 55, 50, 45, 38]
    regions = chord_caged_regions("F#", "major", drop_d)
    assert {p["note"] for region in regions for p in region["positions"]} == {"F#", "A#", "C#"}
    assert all(p["midi"] == drop_d[p["string"] - 1] + p["fret"] for region in regions for p in region["positions"])


def test_chord_caged_regions_in_standard_tuning_match_the_known_c_major_shapes():
    regions = chord_caged_regions("C", "major", STANDARD_TUNING)
    assert [r['shape'] for r in regions] == list('CAGED')
    assert {r['shape']: [(p['string'], p['fret']) for p in r['positions']] for r in regions} == {
        'C': [(1, 0), (2, 1), (3, 0), (4, 2), (5, 3)],
        'A': [(1, 3), (2, 5), (3, 5), (4, 5), (5, 3)],
        'G': [(1, 8), (2, 5), (3, 5), (4, 5), (5, 7), (6, 8)],
        'E': [(1, 8), (2, 8), (3, 9), (4, 10), (5, 10), (6, 8)],
        'D': [(1, 12), (2, 13), (3, 12), (4, 10)],
    }


def test_minor_caged_regions_spell_the_minor_triad():
    regions = chord_caged_regions("C", "minor", STANDARD_TUNING)
    assert {p["note"] for region in regions for p in region["positions"]} == {"C", "Eb", "G"}


def test_tuning_projection_preserves_shape_order_when_first_frets_tie():
    regions = chord_caged_regions('D', 'major', [64, 60, 55, 48, 43, 36])
    assert [(r['shape'], r['fret_start']) for r in regions] == [('D', 2), ('C', 2), ('A', 5), ('G', 6), ('E', 9)]


def test_unsupported_caged_quality_is_rejected():
    with pytest.raises(ValueError, match='Unsupported CAGED quality'):
        chord_caged_regions('C', 'dominant7', STANDARD_TUNING)
