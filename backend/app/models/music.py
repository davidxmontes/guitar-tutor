"""Pydantic schemas for music theory endpoints (fretboard, tunings, scales, chords)."""

from pydantic import BaseModel


class NotePosition(BaseModel):
    """A single note position on the fretboard."""

    string: int  # 1-6 (1 = high E, 6 = low E)
    fret: int  # 0-22 (0 = open string)
    note: str  # Note name, e.g., "C", "F#", "Bb"


class FretboardResponse(BaseModel):
    """Response for /api/fretboard endpoint."""

    tuning: str
    tuning_notes: list[str]  # e.g., ["E", "B", "G", "D", "A", "E"]
    strings: list[list[NotePosition]]  # 6 strings, each with 23 positions
    fret_count: int


class TuningInfo(BaseModel):
    """Information about a guitar tuning."""

    id: str
    name: str
    notes: list[str]  # Open string notes from string 1 (high E) to string 6 (low E)


class TuningsResponse(BaseModel):
    """Response for /api/tunings endpoint."""

    tunings: list[TuningInfo]


class ScaleInfo(BaseModel):
    """Basic scale information."""

    id: str
    name: str


class ScaleCategory(BaseModel):
    """Category of scales."""

    category: str
    scales: list[ScaleInfo]


class ScalesListResponse(BaseModel):
    """Response for /api/scales endpoint."""

    scales: list[ScaleCategory]


class DiatonicChord(BaseModel):
    """A diatonic chord in a scale."""

    numeral: str  # e.g., "I", "ii", "IV"
    root: str  # Root note, e.g., "C"
    quality: str  # "major", "minor", "diminished"
    display: str  # Display name, e.g., "Cmaj", "Dm"


class ScaleNotePosition(BaseModel):
    """A note position with scale information."""

    string: int
    fret: int
    note: str
    is_root: bool
    degree: int  # 1-7
    degree_label: str  # "1", "b3", etc.


class ScaleResponse(BaseModel):
    """Response for /api/scales/{root}/{mode} endpoint."""

    root: str
    mode: str
    scale_notes: list[str]
    positions: list[ScaleNotePosition]
    diatonic_chords: list[DiatonicChord]


class ChordQualityInfo(BaseModel):
    """Information about a chord quality."""

    id: str
    name: str


class ChordQualitiesResponse(BaseModel):
    """Response for /api/chords/qualities endpoint."""

    qualities: list[ChordQualityInfo]


class ChordVoicingPosition(BaseModel):
    """A single position within a chord voicing."""

    string: int
    fret: int
    note: str
    interval: str  # "1", "3", "5", "b3", etc.
    is_root: bool


class ChordVoicing(BaseModel):
    """A single chord voicing."""

    label: str  # e.g. "Pos 1"
    name: str
    color: str
    base_fret: int
    min_fret: int
    max_fret: int
    positions: list[ChordVoicingPosition]


class ChordResponse(BaseModel):
    """Response for /api/chords/{root}/{quality} endpoint."""

    root: str
    quality: str
    display_name: str
    chord_notes: list[str]
    voicings: list[ChordVoicing]
