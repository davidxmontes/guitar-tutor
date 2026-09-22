"""Typed branch-local Harmony state; concrete voicings are always by value."""
from typing import Annotated, Any, Literal
from pydantic import Field, field_validator, model_validator
from app.music.chords import CHORD_INTERVALS
from app.music.scales import SCALE_INTERVALS
from app.v2.workspace import Identifier, Midi, NoteGroup, PhysicalRef, Pitch, StrictModel

Tuning = Annotated[list[Midi], Field(min_length=6, max_length=6)]
STANDARD_TUNING = [64, 59, 55, 50, 45, 40]


class ChordRef(StrictModel):
    root: Pitch
    quality: str

    @field_validator('quality')
    @classmethod
    def known_quality(cls, value):
        if value not in CHORD_INTERVALS:
            raise ValueError('Unknown chord quality')
        return value


class TonalCenter(StrictModel):
    root: Pitch
    scale: str

    @field_validator('scale')
    @classmethod
    def known_scale(cls, value):
        if value not in SCALE_INTERVALS:
            raise ValueError('Unknown scale')
        return value


class VoicingValue(StrictModel):
    positions: list[PhysicalRef] = Field(min_length=1, max_length=6)
    tuning: Tuning

    @model_validator(mode='after')
    def unique_strings(self):
        if len({p.string for p in self.positions}) != len(self.positions):
            raise ValueError('A voicing has at most one position per string')
        if any(self.tuning[p.string - 1] + p.fret > 127 for p in self.positions):
            raise ValueError('Voicing pitch exceeds MIDI range')
        return self


class ScratchChord(ChordRef):
    id: Identifier


class PinnedVoicing(StrictModel):
    chord: ChordRef
    voicing: VoicingValue


class ScaleFocus(StrictModel):
    kind: Literal['scale'] = 'scale'


class DegreeFocus(StrictModel):
    kind: Literal['degree'] = 'degree'
    degree: int = Field(ge=1, le=7, strict=True)


class ChordFocus(StrictModel):
    kind: Literal['chord'] = 'chord'
    chord: ChordRef


class VoicingFocus(StrictModel):
    kind: Literal['voicing'] = 'voicing'
    chord: ChordRef
    voicing: VoicingValue


class ShapeFocus(StrictModel):
    kind: Literal['shape'] = 'shape'
    positions: list[PhysicalRef] = Field(default_factory=list, max_length=6)
    interpretation: ChordRef | None = None

    @model_validator(mode='after')
    def unique_strings(self):
        if len({p.string for p in self.positions}) != len(self.positions):
            raise ValueError('A shape has at most one position per string')
        return self


HarmonyFocus = Annotated[ScaleFocus | DegreeFocus | ChordFocus | VoicingFocus | ShapeFocus, Field(discriminator='kind')]


class ConceptSeed(StrictModel):
    kind: Literal['concept-seed'] = 'concept-seed'
    concept: str
    prompt: str | None = None


class HarmonyDevelop(StrictModel):
    kind: Literal['harmony-develop'] = 'harmony-develop'
    scratch: list[ScratchChord]
    tonal_center: TonalCenter | None = None


class SongIdea(StrictModel):
    kind: Literal['song-idea'] = 'song-idea'
    song: dict[str, Any]  # Existing inspired_by snapshot, not a live source link.


Provenance = Annotated[ConceptSeed | HarmonyDevelop | SongIdea, Field(discriminator='kind')]


class HarmonyExploration(StrictModel):
    tonal_center: TonalCenter | None = None
    tuning: Tuning = Field(default_factory=lambda: STANDARD_TUNING.copy())
    scratch: list[ScratchChord] = Field(default_factory=list)
    focus: HarmonyFocus = Field(default_factory=ScaleFocus)
    pinned_voicings: list[PinnedVoicing] = Field(default_factory=list)
    kept_note_groups: list[NoteGroup] = Field(default_factory=list)
    provenance: Provenance | None = None

    @model_validator(mode='after')
    def unique_ids(self):
        for values in (self.scratch, self.kept_note_groups):
            if len({value.id for value in values}) != len(values):
                raise ValueError('Duplicate workspace ID')
        if self.focus.kind == 'voicing' and self.focus.voicing.tuning != self.tuning:
            raise ValueError('Focused voicing must match exploration tuning')
        if self.focus.kind == 'shape':
            pitches = {self.tuning[p.string - 1] + p.fret for p in self.focus.positions}
            if any(midi > 127 for midi in pitches):
                raise ValueError('Shape pitch exceeds MIDI range')
            if self.focus.interpretation:
                from app.v2.workspace import pitch_class
                chord = self.focus.interpretation
                tones = {(pitch_class(chord.root) + n) % 12 for n in CHORD_INTERVALS[chord.quality]['intervals']}
                selected = {midi % 12 for midi in pitches}
                if len(selected) < 2 or not selected <= tones or len(tones - selected) > 2:
                    raise ValueError('Interpretation must fit the selected notes')
        return self
