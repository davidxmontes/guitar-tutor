"""
Pydantic schemas for agent chat endpoints.
"""

from typing import Annotated, List, Literal, Optional, Union

from pydantic import BaseModel, Field


class AgentMessage(BaseModel):
    """A single message in a conversation."""
    role: str  # "user" or "assistant"
    content: str


class UiScaleContext(BaseModel):
    root: Optional[str] = None
    mode: Optional[str] = None


class UiChordContext(BaseModel):
    root: Optional[str] = None
    quality: Optional[str] = None


class UiSongContext(BaseModel):
    song_id: Optional[int] = None
    artist: Optional[str] = None
    title: Optional[str] = None
    has_chords: Optional[bool] = None


class UiHighlightedNote(BaseModel):
    string: int
    fret: int


class UiContext(BaseModel):
    """Structured UI context passed from frontend for agent awareness."""

    app_mode: Optional[Literal["scale", "chord", "song"]] = None
    display_mode: Optional[Literal["notes", "intervals"]] = None

    selected_tuning: Optional[str] = None
    custom_tuning_notes: Optional[List[str]] = None

    selected_scale: Optional[UiScaleContext] = None
    selected_chord: Optional[UiChordContext] = None

    selected_song: Optional[UiSongContext] = None
    selected_track_index: Optional[int] = None
    song_view_mode: Optional[Literal["tab", "chords"]] = None

    playhead_measure_index: Optional[int] = None
    selected_beat_id: Optional[str] = None
    highlighted_notes: Optional[List[UiHighlightedNote]] = None

    model_config = {"extra": "allow"}


class AgentRequest(BaseModel):
    """Request for /api/agent/chat endpoint."""
    message: str
    conversation_history: List[AgentMessage] = Field(default_factory=list)  # Deprecated fallback
    bootstrap_history: List[AgentMessage] = Field(default_factory=list)
    require_existing_thread: bool = False
    ui_context: Optional[UiContext] = None
    thread_id: Optional[str] = "default"


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
    chords: List[ChordApiRequest] = Field(default_factory=list)
    scale: Optional[ScaleApiRequest] = None


class ResumeRequest(BaseModel):
    """Request for /api/agent/resume endpoint."""
    response: str  # User's response to the clarifying question
    thread_id: str = "default"
    ui_context: Optional[UiContext] = None


class SongSearchAction(BaseModel):
    type: Literal["song.search"]
    query: str


class SongSelectAction(BaseModel):
    type: Literal["song.select"]
    song_id: int


class SongTrackSelectAction(BaseModel):
    type: Literal["song.track.select"]
    track_index: int


class SongMeasureFocusAction(BaseModel):
    type: Literal["song.measure.focus"]
    measure_index: int
    beat_index: Optional[int] = None


class TheoryShowChordAction(BaseModel):
    type: Literal["theory.show_chord"]
    root: str
    quality: str


class TheoryShowScaleAction(BaseModel):
    type: Literal["theory.show_scale"]
    root: str
    mode: str


AgentAction = Annotated[
    Union[
        SongSearchAction,
        SongSelectAction,
        SongTrackSelectAction,
        SongMeasureFocusAction,
        TheoryShowChordAction,
        TheoryShowScaleAction,
    ],
    Field(discriminator="type"),
]


class AgentResponse(BaseModel):
    """Response for /api/agent/chat endpoint."""
    answer: str
    scale: Optional[str] = None
    chord_choices: List[str] = Field(default_factory=list)
    visualizations: bool = False
    out_of_scope: bool = False
    interrupted: bool = False
    interrupt_data: Optional[dict] = None
    api_requests: Optional[ApiRequests] = None
    actions: List[AgentAction] = Field(default_factory=list)
    memory_status: Literal["restored", "bootstrapped", "fresh"] = "fresh"
