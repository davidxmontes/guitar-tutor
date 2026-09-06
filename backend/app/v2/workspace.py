"""Retained deterministic music helpers for the V2 workspaces.

Ticket #101 deleted the ConceptWorkspace model, `resolve_workspace`, the
Block/entity/relation vocabulary and `workspace_changes`. What survives here
is the small, kind-agnostic toolkit that Harmony (H1) and Progression (P1)
build on: NoteGroup / NoteRef, note spelling, and the shared pitch helpers
that `workspace_caged` region generation needs.
"""
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

Pitch = Annotated[str, Field(pattern=r'^[A-G](#{1,2}|b{1,2})?$')]
Identifier = Annotated[str, Field(min_length=1, max_length=80)]
Midi = Annotated[int, Field(strict=True, ge=0, le=127)]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid')


class PitchRef(StrictModel):
    pitch_class: int = Field(ge=0, le=11, strict=True)


class PhysicalRef(StrictModel):
    string: int = Field(ge=1, le=6, strict=True)
    fret: int = Field(ge=0, le=24, strict=True)


NoteRef = PitchRef | PhysicalRef


class NoteGroup(StrictModel):
    """A labelled highlight layer — pitch-class or physical note references
    (CONTEXT.md). Kept in a Workspace's working state or carried turn-scoped
    on a Composition."""

    id: Identifier
    kind: Literal['noteGroup'] = 'noteGroup'
    label: str = Field(min_length=1, max_length=120)
    notes: list[NoteRef] = Field(min_length=1, max_length=24)


NATURAL_PITCHES = dict(zip('CDEFGAB', [0, 2, 4, 5, 7, 9, 11]))
CHROMATIC = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
# Diatonic-chord helper: the major-scale triad qualities by degree.
DIATONIC_TRIADS = list(zip(['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'],
                           ['major', 'minor', 'minor', 'major', 'major', 'minor', 'diminished']))


def pitch_class(note: str) -> int:
    return (NATURAL_PITCHES[note[0]] + note.count('#') - note.count('b')) % 12


def chromatic_note(pitch: int) -> dict:
    return {'note': CHROMATIC[pitch % 12], 'degree': '—', 'pitch_class': pitch % 12, 'offset': 0}


def spelled_notes(root: str, offsets: list[int], degrees: list[str]) -> list[dict]:
    notes = []
    for offset, degree in zip(offsets, degrees):
        pitch = (pitch_class(root) + offset) % 12
        letter = 'CDEFGAB'[('CDEFGAB'.index(root[0]) + int(degree.lstrip('b#')) - 1) % 7]
        accidental = (pitch - NATURAL_PITCHES[letter] + 6) % 12 - 6
        notes.append({'note': letter + ('#' * accidental if accidental > 0 else 'b' * -accidental),
                      'degree': degree, 'pitch_class': pitch, 'offset': offset})
    return notes


def resolve_note_group(entity: NoteGroup, tuning: list[int]) -> dict:
    """Every fret 0-19 a pitch-class ref lands on, plus each explicit physical ref."""
    positions: list[dict] = []
    for ref in entity.notes:
        if isinstance(ref, PitchRef):
            positions.extend({'string': string, 'fret': fret, 'midi': midi + fret, **chromatic_note(ref.pitch_class)}
                             for string, midi in enumerate(tuning, 1) for fret in range(20)
                             if (midi + fret) % 12 == ref.pitch_class)
        else:
            midi = tuning[ref.string - 1] + ref.fret
            positions.append({'string': ref.string, 'fret': ref.fret, 'midi': midi, **chromatic_note(midi)})
    seen: dict[int, dict] = {}
    for position in positions:
        seen.setdefault(position['pitch_class'], {k: position[k] for k in ('note', 'degree', 'pitch_class', 'offset')})
    return {'id': entity.id, 'kind': 'noteGroup', 'label': entity.label,
            'notes': list(seen.values()), 'positions': positions, 'tuning': tuning}
