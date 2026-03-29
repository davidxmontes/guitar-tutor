"""Pydantic models for Songsterr API responses and our song endpoints."""

from pydantic import BaseModel, Field


# --- Songsterr API response models (parsed from external API) ---

class SongsterrTrack(BaseModel):
    model_config = {"extra": "ignore"}

    instrument_id: int = Field(alias="instrumentId")
    instrument: str
    views: int = 0
    name: str = ""
    tuning: list[int] | None = None
    difficulty: int | None = None
    hash: str = ""


class SongsterrRevisionTrack(SongsterrTrack):
    is_vocal_track: bool = Field(default=False, alias="isVocalTrack")
    is_empty: bool = Field(default=False, alias="isEmpty")


class SongsterrRecord(BaseModel):
    model_config = {"extra": "ignore"}

    song_id: int = Field(alias="songId")
    artist_id: int = Field(alias="artistId")
    artist: str
    title: str
    has_chords: bool = Field(default=False, alias="hasChords")
    has_player: bool = Field(default=False, alias="hasPlayer")
    tracks: list[SongsterrTrack]
    default_track: int = Field(default=0, alias="defaultTrack")
    popular_track: int = Field(default=0, alias="popularTrack")


class SongsterrRevisionResponse(BaseModel):
    model_config = {"extra": "ignore"}

    revision_id: int = Field(alias="revisionId")
    song_id: int = Field(alias="songId")
    artist: str
    title: str
    description: str = ""
    tracks: list[SongsterrRevisionTrack]
    default_track: int = Field(default=0, alias="defaultTrack")
    popular_track: int = Field(default=0, alias="popularTrack")
    image: str | None = None
    source: str | None = None


class SongsterrChordsResponse(BaseModel):
    model_config = {"extra": "ignore"}

    song_id: int = Field(alias="songId")
    artist: str
    title: str
    chordpro: str
    chords_revision_id: int = Field(alias="chordsRevisionId")


# --- Our API response models ---

class TrackSummary(BaseModel):
    index: int
    name: str
    instrument: str
    is_vocal: bool = False
    is_empty: bool = False
    tuning: list[int] | None = None


class SongSearchResult(BaseModel):
    song_id: int
    artist: str
    title: str
    has_chords: bool
    tracks: list[TrackSummary]


class SongSearchResponse(BaseModel):
    results: list[SongSearchResult]


class SongTracksResponse(BaseModel):
    song_id: int
    artist: str
    title: str
    tracks: list[TrackSummary]


class TabDataResponse(BaseModel):
    song_id: int
    artist: str
    title: str
    track_name: str
    tab_data: dict


class ChordProResponse(BaseModel):
    song_id: int
    artist: str
    title: str
    chordpro: str
