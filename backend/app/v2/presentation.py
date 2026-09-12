"""Turn-owned presentation contract (Spec #100 §5.5–5.6).

Config overrides address blocks by slot/index paths, e.g. ``hero.0`` or
``hero.0.peers.1``. Capabilities are product-owned, never model input.
"""
from typing import Any, Literal

from pydantic import Field, ValidationInfo, model_validator

from app.v2.workspace import StrictModel

WorkspaceKind = Literal['harmony', 'progression']
Pattern = Literal['hero-with-support', 'comparison', 'master-detail', 'explanation-led']

# Each cell contains the fixed capabilities and allowed config keys, verbatim
# in meaning from §5.5. Missing cells are forbidden, not empty implementations.
CAPABILITIES = {
    'harmony': {
        'fretboard': ('scale/chord/voicing/note-group layers; select note → Focus; preview voicing', ('labels', 'fret_window', 'overlay')),
        'chord-inspector': ('chord tones; intervals; construction; function-in-key if set', ('subject',)),
        'voicing-explorer': ('browse voicings; caged; select → voicing Focus; pin', ('subject', 'view')),
        'chord-palette': ('diatonic chords; click → chord Focus or add-to-scratch', ('labels',)),
        'scratch-sequence': ('ordered chords; add/remove/reorder; play/loop; Develop', ()),
        'circle-of-fifths': ('keys; home and neighbours; key selection → tonal centre', ()),
        'degree-map': ('scale degrees; click → degree Focus', ('labels',)),
        'triad-explorer': ('three-note shapes; adjacent string sets; bass and inversions; hear, focus and pin', ('string_set', 'inversion', 'max_shapes')),
    },
    'progression': {
        'fretboard': ('focused step chord and next on transition; select note', ('labels', 'fret_window', 'overlay')),
        'chord-inspector': ('chord tones; function label; replace', ('subject',)),
        'progression-idea-list': ('kept ideas; click → active idea', ()),
        'progression-editor': ('one focused chord: edit quality/duration, reorder, assign and hear voicing; persistent chord navigation selects the step', ('beats_per_bar',)),
        'voice-leading': ('adjacent shared/moving voices; select transition → Focus and both chords on fretboard; assigned real motion or realization-independent', ('between',)),
        'harmonic-function': ('numerals and T/S/D with tonal centre; select chord → step Focus and fretboard; otherwise set a key', ()),
    },
}
for workspace, candidate_kinds in [('harmony', 'voicing'), ('progression', 'progression-idea/chord-replacement')]:
    CAPABILITIES[workspace].update({
        'explanation': ('plain subject-aware Tutor prose', ('text', 'subject')),
        'comparison': ('2–4 same-kind peers; deterministic per-peer sub-view', ('peers', 'context')),
        'note-group-overlay': ('bind turn-scoped or kept NoteGroup highlight', ('note_group_id',)),
        'candidate-set': (candidate_kinds + ' candidates', ('candidate_kind', 'candidates')),
    })

PATTERNS = {
    'hero-with-support': ('hero', {'hero': (1, 1), 'support': (1, 3)}),
    'comparison': ('peers', {'peers': (2, 4), 'context': (0, 1)}),
    'master-detail': ('detail', {'list': (1, 1), 'detail': (1, 2)}),
    'explanation-led': ('explanation', {'explanation': (1, 1), 'illustration': (1, 2)}),
}


class BlockSpec(StrictModel):
    kind: str
    subject: Any = None
    config: dict[str, Any] = Field(default_factory=dict)
    emphasis: Literal['normal', 'muted'] = 'normal'


class Composition(StrictModel):
    pattern: Pattern
    slots: dict[str, list['BlockSpec | Composition']]
    focal: str
    per_block_config: dict[str, dict[str, Any]] = Field(default_factory=dict)

    @model_validator(mode='after')
    def validate_surface(self, info: ValidationInfo):
        focal, slots = PATTERNS[self.pattern]
        if self.focal != focal or self.slots.keys() - slots.keys():
            raise ValueError('Composition must name exactly its pattern focal and legal slots')
        for slot, (minimum, maximum) in slots.items():
            if not minimum <= len(self.slots.get(slot, [])) <= maximum:
                raise ValueError(f'{slot} requires {minimum}–{maximum} elements')
        for elements in self.slots.values():
            for element in elements:
                if isinstance(element, Composition):
                    if element.pattern != 'comparison' or any(
                        isinstance(child, Composition)
                        for children in element.slots.values() for child in children
                    ):
                        raise ValueError('Only one nested comparison level is allowed')
        workspace = (info.context or {}).get('workspace_kind')
        if workspace is not None:
            if workspace not in CAPABILITIES:
                raise ValueError('Unknown workspace kind')
            blocks = dict(self.blocks())
            if self.per_block_config.keys() - blocks.keys():
                raise ValueError('Config override must address an existing block')
            for path, block in blocks.items():
                validate_block(workspace, block, block.config)
                if path in self.per_block_config:
                    validate_block(workspace, block, block.config | self.per_block_config[path])
        return self

    def blocks(self, prefix=''):
        for slot, elements in self.slots.items():
            for index, element in enumerate(elements):
                path = f'{prefix}{slot}.{index}'
                if isinstance(element, Composition):
                    yield from element.blocks(path + '.')
                else:
                    yield path, element


def validate_block(workspace: str, block: BlockSpec, config: dict):
    cell = CAPABILITIES[workspace].get(block.kind)
    if cell is None or config.keys() - set(cell[1]):
        raise ValueError(f'{block.kind}: unsupported block or configuration for {workspace}')
    labels = {'fretboard': ('notes', 'degrees'), 'degree-map': ('degrees', 'notes'),
              'chord-palette': ('symbols', 'numerals')}
    if 'labels' in config and config['labels'] not in labels[block.kind]:
        raise ValueError('Invalid label mode')
    if 'view' in config and config['view'] not in ('list', 'caged'):
        raise ValueError('Invalid voicing view')
    if 'string_set' in config and (type(config['string_set']) is not int or config['string_set'] not in (1, 2, 3, 4)):
        raise ValueError('string_set starts at string 1–4')
    if 'max_shapes' in config and (type(config['max_shapes']) is not int or not 1 <= config['max_shapes'] <= 12):
        raise ValueError('Invalid triad shape count')
    if 'inversion' in config and (type(config['inversion']) is not int or config['inversion'] not in (0, 1, 2)):
        raise ValueError('inversion must be 0, 1 or 2')
    if 'fret_window' in config:
        window = config['fret_window']
        if not (isinstance(window, list) and len(window) == 2
                and all(type(fret) is int for fret in window) and 0 <= window[0] <= window[1] <= 24):
            raise ValueError('fret_window must be [first, last] within 0–24')
    if 'candidate_kind' in config and config['candidate_kind'] not in (
        ('voicing',) if workspace == 'harmony' else ('progression-idea', 'chord-replacement')
    ):
        raise ValueError('Candidate kind is outside workspace capabilities')
    if 'beats_per_bar' in config and (type(config['beats_per_bar']) is not int or config['beats_per_bar'] < 1):
        raise ValueError('beats_per_bar must be a positive integer')
    if 'between' in config:
        between = config['between']
        if not (isinstance(between, dict) and set(between) == {'from_step_id', 'to_step_id'}
                and all(isinstance(value, str) and value for value in between.values())):
            raise ValueError('between requires two step IDs')
    for key in ('text', 'note_group_id'):
        if key in config and not isinstance(config[key], str):
            raise ValueError(f'{key} must be text')
    if 'candidates' in config and not isinstance(config['candidates'], list):
        raise ValueError('candidates must be a list')
    if 'peers' in config:
        peers = config['peers']
        if not (isinstance(peers, list) and 2 <= len(peers) <= 4
                and all(isinstance(peer, dict) and peer.get('kind') in ('scale', 'chord', 'voicing', 'progression-idea') for peer in peers)
                and len({peer['kind'] for peer in peers}) == 1):
            raise ValueError('comparison requires 2–4 same-kind peers')


def validate_composition(workspace_kind: WorkspaceKind, composition: Composition | dict) -> Composition:
    """Return a validated surface or Pydantic's structured ValidationError.

    Revalidate model instances too: callers cannot bypass the workspace boundary
    with model_construct or an instance validated for the sibling workspace.
    """
    if isinstance(composition, Composition):
        composition = composition.model_dump()
    return Composition.model_validate(composition, context={'workspace_kind': workspace_kind})
