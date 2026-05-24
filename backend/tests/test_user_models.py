from app.models.user import (
    SavedProgression,
    SaveProgressionRequest,
    FavoriteSong,
    AddFavoriteRequest,
    ConversationThread,
)


def test_save_progression_request_validates_required_fields():
    req = SaveProgressionRequest(
        name="My blues",
        key_root="A",
        key_mode="minor",
        slots=[{"root": "A", "quality": "minor"}],
    )
    assert req.name == "My blues"
    assert len(req.slots) == 1


def test_save_progression_request_allows_null_key():
    req = SaveProgressionRequest(name="Unnamed", slots=[])
    assert req.key_root is None
    assert req.key_mode is None


def test_add_favorite_request_validates():
    req = AddFavoriteRequest(songsterr_song_id=12345, title="Wish You Were Here", artist="Pink Floyd")
    assert req.songsterr_song_id == 12345


def test_conversation_thread_model():
    thread = ConversationThread(
        id="abc-123",
        title="How do barre chords work?",
        preview="Barre chords involve pressing...",
        last_message_at="2026-05-23T12:00:00Z",
        created_at="2026-05-23T12:00:00Z",
    )
    assert thread.id == "abc-123"
