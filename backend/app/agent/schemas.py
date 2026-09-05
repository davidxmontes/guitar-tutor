"""Schemas and state definitions for the Guitar Tutor agent."""

from typing import List, Optional, TypedDict

from langgraph.graph import MessagesState
from pydantic import BaseModel, Field


class ClassificationSchema(TypedDict):
    """Schema for the classify_input node output."""

    out_of_scope: bool = Field(False, description="Whether the question is out of scope")
    clarifying_question_for_user: Optional[str] = Field(None, description="A clarifying question to send to the user")
    intent: str = Field("general", description="Primary intent: 'song' | 'chord' | 'scale' | 'general'")


class SongToolPlanSchema(BaseModel):
    """Structured song-tool intent chosen during answer generation."""

    song_search_query: Optional[str] = Field(
        None,
        description=(
            "Search query for a specific song the user wants opened in the song UI, "
            "for example 'frisky dominic fike'. Null when no song lookup is needed."
        ),
    )
    focus_measure_number: Optional[int] = Field(
        None,
        description=(
            "1-based measure number the user wants focused in the currently selected or requested song. "
            "Null when no measure navigation is needed."
        ),
    )


class FretboardHighlightPositionSchema(TypedDict):
    string: int
    fret: int


class FretboardHighlightGroupSchema(TypedDict):
    name: str
    positions: List[FretboardHighlightPositionSchema]


class AnswerPostProcessSchema(TypedDict):
    """Combined schema for metadata extraction + fretboard highlights in one call."""

    scale: Optional[str] = Field(None, description="Most relevant scale name")
    chord_choices: List[str] = Field(default_factory=list, description="List of chord names recommended")
    visualizations: bool = Field(False, description="Whether visualizations are needed")
    highlight_groups: List[FretboardHighlightGroupSchema] = Field(default_factory=list, description="Fretboard highlight groups")
    progression_chords: List[dict] = Field(
        default_factory=list,
        description=(
            "When the answer presents a chord progression, list each chord as "
            "{root: str, quality: str, positions?: [{string: int, fret: int}]}. "
            "quality must be an exact id: major, minor, diminished, augmented, sus2, sus4, 7sus4, "
            "dominant7, major7, minor7, 9, maj9, m9, dim7, m7b5, 6, m6, add9, madd9. "
            "Use add9 for Cadd9/Gadd9 etc — never substitute major7 for add9. "
            "Use this instead of highlight_groups when the answer is about a sequence of chords. "
            "Empty list when the answer is not about a chord progression."
        ),
    )


class OverallState(MessagesState):
    """Overall state for the agent graph."""

    clarifying_question_for_user: Optional[str] = None
    answer: str = ""
    scale: Optional[str] = None
    chord_choices: List[str] = []
    visualizations: bool = False
    out_of_scope: bool = False

    # Context/memory fields
    ui_context: dict = {}
    running_summary: str = ""
    summary_turn_count: int = 0

    # Response fields
    actions: List[dict] = []
    memory_status: str = "fresh"
    intent: str = "general"
