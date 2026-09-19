"""User profile service — progressions, favorites, and conversation threads."""

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, status

from app.db import get_supabase_client
from app.models.user import (
    AddFavoriteRequest,
    ConversationThread,
    FavoriteSong,
    SavedProgression,
    SaveProgressionRequest,
)

logger = logging.getLogger(__name__)


def _require_client():
    client = get_supabase_client()
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database not configured",
        )
    return client


# --- Progressions ---

def list_progressions(user_id: str) -> list[SavedProgression]:
    client = _require_client()
    result = (
        client.table("saved_progressions")
        .select("*")
        .eq("clerk_user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return [SavedProgression(**row) for row in result.data]


def save_progression(user_id: str, data: SaveProgressionRequest) -> SavedProgression:
    client = _require_client()
    payload = {
        "clerk_user_id": user_id,
        "name": data.name,
        "key_root": data.key_root,
        "key_mode": data.key_mode,
        "slots": data.slots,
    }
    result = client.table("saved_progressions").insert(payload).execute()
    return SavedProgression(**result.data[0])


def delete_progression(user_id: str, progression_id: str) -> None:
    client = _require_client()
    check = (
        client.table("saved_progressions")
        .select("id")
        .eq("id", progression_id)
        .eq("clerk_user_id", user_id)
        .execute()
    )
    if not check.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Progression not found")
    client.table("saved_progressions").delete().eq("id", progression_id).execute()


# --- Favorites ---

def list_favorites(user_id: str) -> list[FavoriteSong]:
    client = _require_client()
    result = (
        client.table("favorite_songs")
        .select("*")
        .eq("clerk_user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return [FavoriteSong(**row) for row in result.data]


def add_favorite(user_id: str, data: AddFavoriteRequest) -> FavoriteSong:
    client = _require_client()
    payload = {
        "clerk_user_id": user_id,
        "songsterr_song_id": data.songsterr_song_id,
        "title": data.title,
        "artist": data.artist,
    }
    result = (
        client.table("favorite_songs")
        .upsert(payload, on_conflict="clerk_user_id,songsterr_song_id")
        .execute()
    )
    return FavoriteSong(**result.data[0])


def remove_favorite(user_id: str, songsterr_song_id: int) -> None:
    client = _require_client()
    check = (
        client.table("favorite_songs")
        .select("id")
        .eq("clerk_user_id", user_id)
        .eq("songsterr_song_id", songsterr_song_id)
        .execute()
    )
    if not check.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Favorite not found")
    (
        client.table("favorite_songs")
        .delete()
        .eq("clerk_user_id", user_id)
        .eq("songsterr_song_id", songsterr_song_id)
        .execute()
    )


# --- Conversation threads ---

def list_threads(user_id: str) -> list[ConversationThread]:
    client = _require_client()
    result = (
        client.table("conversation_threads")
        .select("*")
        .eq("clerk_user_id", user_id)
        .order("last_message_at", desc=True)
        .execute()
    )
    return [ConversationThread(**row) for row in result.data]


def upsert_thread(
    user_id: str,
    thread_id: str,
    title: str,
    preview: Optional[str],
    last_message_at: datetime,
) -> None:
    client = _require_client()
    metadata = {
        "title": title[:80],
        "preview": preview[:120] if preview else None,
        "last_message_at": last_message_at.isoformat(),
    }
    # A colliding client-supplied ID must never transfer another user's thread.
    client.table("conversation_threads").upsert(
        {"id": thread_id, "clerk_user_id": user_id, **metadata},
        on_conflict="id", ignore_duplicates=True,
    ).execute()
    client.table("conversation_threads").update(metadata).eq("id", thread_id).eq("clerk_user_id", user_id).execute()
