from pydantic import BaseModel
from typing import Optional, List


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


# Chord-related schemas

class ChordQualityInfo(BaseModel):
    """Information about a chord quality."""
    id: str
    name: str


class ChordQualitiesResponse(BaseModel):
    """Response for /api/chords/qualities endpoint."""
    qualities: list[ChordQualityInfo]


class CagedShapePosition(BaseModel):
    """A single position within a CAGED shape."""
    string: int
    fret: int
    note: str
    interval: str  # "1", "3", "5", "b3", etc.
    is_root: bool


class CagedShape(BaseModel):
    """A single CAGED shape voicing."""
    shape: str  # "C", "A", "G", "E", "D"
    name: str  # e.g., "C Major (A shape)"
    color: str  # CSS color for this shape
    base_fret: int  # Starting fret position
    min_fret: int
    max_fret: int
    positions: list[CagedShapePosition]


class ChordResponse(BaseModel):
    """Response for /api/chords/{root}/{quality} endpoint."""
    root: str
    quality: str
    display_name: str  # e.g., "Cmaj7", "Am"
    chord_notes: list[str]  # Notes in the chord
    caged_shapes: list[CagedShape]  # All 5 CAGED positions


# Agent-related schemas

class AgentMessage(BaseModel):
    """A single message in a conversation."""
    role: str  # "user" or "assistant"
    content: str


class AgentRequest(BaseModel):
    """Request for /api/agent/chat endpoint."""
    message: str
    conversation_history: List[AgentMessage] = []


class ChordApiRequest(BaseModel):
    """Parsed chord API request info."""
    root: str
    quality: str
    original_name: str
    endpoint: str


class ScaleApiRequest(BaseModel):
    """Parsed scale API request info."""
    root: str
    mode: str
    original_name: str
    endpoint: str


class ApiRequests(BaseModel):
    """Container for parsed API requests from agent response."""
    chords: List[ChordApiRequest] = []
    scale: Optional[ScaleApiRequest] = None


class AgentResponse(BaseModel):
    """Response for /api/agent/chat endpoint."""
    answer: str
    scale: Optional[str] = None
    chord_choices: List[str] = []
    visualizations: bool = False
    out_of_scope: bool = False
    api_requests: Optional[ApiRequests] = None  # Parsed API requests for frontend
