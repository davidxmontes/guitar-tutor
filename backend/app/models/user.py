"""Pydantic schemas for user profile endpoints."""

from typing import Any, Optional
from pydantic import BaseModel


class SaveProgressionRequest(BaseModel):
    name: str
    key_root: Optional[str] = None
    key_mode: Optional[str] = None
    slots: list[dict[str, Any]]


class SavedProgression(BaseModel):
    id: str
    clerk_user_id: str
    name: str
    key_root: Optional[str]
    key_mode: Optional[str]
    slots: list[dict[str, Any]]
    created_at: str


class AddFavoriteRequest(BaseModel):
    songsterr_song_id: int
    title: str
    artist: str


class FavoriteSong(BaseModel):
    id: str
    clerk_user_id: str
    songsterr_song_id: int
    title: str
    artist: str
    created_at: str


class ConversationThread(BaseModel):
    id: str
    clerk_user_id: Optional[str] = None
    title: str
    preview: Optional[str]
    last_message_at: str
    created_at: str
