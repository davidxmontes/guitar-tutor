"""Spec #100 §5.5–5.6: reject illegal teaching surfaces."""
from copy import deepcopy
import pytest
from pydantic import ValidationError
from app.v2.presentation import validate_composition


def hero(block=None):
    return {'pattern': 'hero-with-support', 'focal': 'hero', 'slots': {
        'hero': [block or {'kind': 'fretboard'}], 'support': [{'kind': 'explanation'}]}}


PATTERNS = [hero(),
    {'pattern': 'comparison', 'focal': 'peers', 'slots': {'peers': [{'kind': 'fretboard'}] * 2}},
    {'pattern': 'master-detail', 'focal': 'detail', 'slots': {
        'list': [{'kind': 'progression-idea-list'}], 'detail': [{'kind': 'progression-editor'}]}},
    {'pattern': 'explanation-led', 'focal': 'explanation', 'slots': {
        'explanation': [{'kind': 'explanation'}], 'illustration': [{'kind': 'fretboard'}]}},
]


@pytest.mark.parametrize('surface', PATTERNS)
def test_accepts_each_pattern(surface):
    assert validate_composition('progression', surface).pattern == surface['pattern']


@pytest.mark.parametrize('patch', [
    {'pattern': 'grid'}, {'focal': None}, {'focal': ['hero', 'support']}, {'focal': 'support'},
    {'slots': {'hero': [], 'support': [{'kind': 'explanation'}]}},
    {'slots': {'hero': [{'kind': 'fretboard'}] * 2, 'support': [{'kind': 'explanation'}]}},
    {'slots': {'hero': [{'kind': 'fretboard'}], 'support': [{'kind': 'explanation'}] * 4}},
    {'slots': {'hero': [{'kind': 'fretboard'}], 'support': [], 'rogue': []}},
])
def test_rejects_invalid_layout_with_structured_errors(patch):
    with pytest.raises(ValidationError) as error:
        validate_composition('harmony', hero() | patch)
    assert error.value.errors()[0]['type']


@pytest.mark.parametrize('block', [
    {'kind': 'unknown'}, {'kind': 'progression-editor'},
    {'kind': 'fretboard', 'config': {'grant_action': 'save'}},
    {'kind': 'fretboard', 'actions': ['save']},
    {'kind': 'fretboard', 'config': {'labels': 'numerals'}},
    {'kind': 'fretboard', 'config': {'fret_window': [12, 3]}},
    {'kind': 'candidate-set', 'config': {'candidate_kind': 'progression-idea', 'candidates': []}},
    {'kind': 'voicing-explorer', 'config': {'view': 'piano'}},
])
def test_rejects_vocabulary_or_capability_expansion(block):
    with pytest.raises(ValidationError):
        validate_composition('harmony', hero(block))


def test_only_one_nested_comparison_level():
    comparison = deepcopy(PATTERNS[1])
    assert validate_composition('harmony', hero(comparison))
    comparison['slots']['peers'][0] = deepcopy(PATTERNS[1])
    with pytest.raises(ValidationError):
        validate_composition('harmony', hero(comparison))
    with pytest.raises(ValidationError):
        validate_composition('harmony', hero(hero()))


def test_override_config_cannot_bypass_validation():
    for path, config in [('hero.0', {'labels': 'symbols'}), ('missing.0', {'labels': 'notes'})]:
        with pytest.raises(ValidationError):
            validate_composition('harmony', hero() | {'per_block_config': {path: config}})
