"""
Pydantic schemas for agent chat endpoints.
"""

from typing import List, Optional

from pydantic import BaseModel


class AgentMessage(BaseModel):
    """A single message in a conversation."""
    role: str  # "user" or "assistant"
    content: str


class AgentRequest(BaseModel):
    """Request for /api/agent/chat endpoint."""
    message: str
    conversation_history: List[AgentMessage] = []
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
    chords: List[ChordApiRequest] = []
    scale: Optional[ScaleApiRequest] = None


class ResumeRequest(BaseModel):
    """Request for /api/agent/resume endpoint."""
    response: str  # User's response to the clarifying question
    thread_id: str = "default"


class AgentResponse(BaseModel):
    """Response for /api/agent/chat endpoint."""
    answer: str
    scale: Optional[str] = None
    chord_choices: List[str] = []
    visualizations: bool = False
    out_of_scope: bool = False
    interrupted: bool = False
    interrupt_data: Optional[dict] = None
    api_requests: Optional[ApiRequests] = None
