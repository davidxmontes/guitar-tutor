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


# Independent spec transcription: catches missing cells and widened config keys.
@pytest.mark.parametrize('workspace, expected', [
    ('harmony', {'fretboard': 'labels fret_window overlay', 'chord-inspector': 'subject',
     'voicing-explorer': 'subject view', 'triad-explorer': 'string_set inversion max_shapes', 'chord-palette': 'labels', 'scratch-sequence': '',
     'circle-of-fifths': '', 'degree-map': 'labels', 'scale-staff': 'labels', 'chord-diagram': 'subject', 'explanation': 'text subject',
     'comparison': 'peers context', 'note-group-overlay': 'note_group_id', 'candidate-set': 'candidate_kind candidates'}),
    ('progression', {'fretboard': 'labels fret_window overlay', 'chord-inspector': 'subject',
     'chord-diagram': 'subject', 'progression-idea-list': '', 'progression-editor': 'beats_per_bar', 'voice-leading': 'between',
     'harmonic-function': '', 'explanation': 'text subject', 'comparison': 'peers context',
     'note-group-overlay': 'note_group_id', 'candidate-set': 'candidate_kind candidates'}),
])
def test_capability_table_matches_spec(workspace, expected):
    from app.v2.presentation import CAPABILITIES
    assert {kind: ' '.join(cell[1]) for kind, cell in CAPABILITIES[workspace].items()} == expected
    for kind in expected:
        assert validate_composition(workspace, hero({'kind': kind}))
        with pytest.raises(ValidationError):
            validate_composition(workspace, hero({'kind': kind, 'config': {'actions': ['save']}}))


def test_model_instances_and_base_config_are_revalidated():
    from app.v2.presentation import Composition
    with pytest.raises(ValidationError):
        validate_composition('progression', Composition.model_validate(hero({'kind': 'voicing-explorer'})))
    with pytest.raises(ValidationError):
        validate_composition('harmony', hero({'kind': 'fretboard', 'config': {'labels': 'invalid'}})
                             | {'per_block_config': {'hero.0': {'labels': 'notes'}}})


def test_free_layout_limits_and_nested_capabilities():
    leaf = {'kind': 'fretboard'}
    def stack(children):
        return {'pattern': 'stack', 'focal': 'items', 'slots': {'items': children}}
    surface = stack([{'pattern': 'split', 'focal': 'items', 'slots': {'items': [
        {'kind': 'circle-of-fifths'}, stack([{'kind': 'scale-staff'}, {'kind': 'chord-diagram'}])]}}, leaf])
    assert len(list(validate_composition('harmony', surface).blocks())) == 4
    for invalid in [stack([leaf] * 9), stack([stack([leaf] * 5), stack([leaf] * 4)]),
                    stack([stack([stack([stack([stack([leaf])])])])]),
                    stack([{'kind': 'progression-editor'}]),
                    stack([{'kind': 'fretboard', 'size': '1px'}])]:
        with pytest.raises(ValidationError):
            validate_composition('harmony', invalid)
    with pytest.raises(ValidationError):
        validate_composition('progression', surface)


def test_component_skills_are_discoverable_and_workspace_scoped():
    from app.v2.component_skills import component_skill_tools
    listing, read = component_skill_tools('harmony')
    catalog = listing.invoke({})
    assert any(item['id'] == 'triad-explorer' for item in catalog)
    for item in catalog:
        assert 'instructions' in read.invoke({'id': item['id']})
    assert 'string_set' in read.invoke({'id': 'triad-explorer'})['instructions']
    assert 'error' in read.invoke({'id': '../presentation.py'})
    assert 'error' in read.invoke({'id': 'progression-editor'})
