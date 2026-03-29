"""Song search and tab data endpoints (proxies Songsterr API)."""

from fastapi import APIRouter, HTTPException, Query

from app.models.songsterr import (
    ChordProResponse,
    SongSearchResponse,
    SongSearchResult,
    SongTracksResponse,
    TabDataResponse,
    TrackSummary,
)
from app.services import songsterr

router = APIRouter()


@router.get("/songs/search", response_model=SongSearchResponse)
async def search_songs(q: str = Query(..., min_length=1, description="Search query")):
    """Search for songs by artist/title."""
    try:
        records = await songsterr.search_songs(q)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Songsterr API error: {exc}")

    results = []
    for r in records[:20]:
        tracks = [
            TrackSummary(
                index=i,
                name=t.name or t.instrument,
                instrument=t.instrument,
            )
            for i, t in enumerate(r.tracks)
        ]
        results.append(
            SongSearchResult(
                song_id=r.song_id,
                artist=r.artist,
                title=r.title,
                has_chords=r.has_chords,
                tracks=tracks,
            )
        )

    return SongSearchResponse(results=results)


@router.get("/songs/{song_id}/tracks", response_model=SongTracksResponse)
async def get_song_tracks(song_id: int):
    """Get available tracks for a song (from latest revision)."""
    try:
        revision = await songsterr.get_song_revision(song_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Songsterr API error: {exc}")

    tracks = [
        TrackSummary(
            index=i,
            name=t.name or t.instrument,
            instrument=t.instrument,
            is_vocal=t.is_vocal_track,
            is_empty=t.is_empty,
        )
        for i, t in enumerate(revision.tracks)
    ]

    return SongTracksResponse(
        song_id=revision.song_id,
        artist=revision.artist,
        title=revision.title,
        tracks=tracks,
    )


@router.get("/songs/{song_id}/tab", response_model=TabDataResponse)
async def get_tab(song_id: int, track: int = Query(0, ge=0, description="Track index")):
    """Get tab data for a specific track of a song."""
    try:
        revision = await songsterr.get_song_revision(song_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Songsterr API error: {exc}")

    if not revision.image:
        raise HTTPException(status_code=404, detail="No tab data available for this song")
    if track >= len(revision.tracks):
        raise HTTPException(
            status_code=400,
            detail=f"Track index {track} out of range ({len(revision.tracks)} tracks available)",
        )

    try:
        tab_data = await songsterr.get_tab_data(
            revision.song_id, revision.revision_id, revision.image, track,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to fetch tab data: {exc}")

    track_info = revision.tracks[track]
    return TabDataResponse(
        song_id=revision.song_id,
        artist=revision.artist,
        title=revision.title,
        track_name=track_info.name or track_info.instrument,
        tab_data=tab_data,
    )


@router.get("/songs/{song_id}/chords", response_model=ChordProResponse)
async def get_chords(song_id: int):
    """Get ChordPro (lyrics + chords) for a song."""
    try:
        revision = await songsterr.get_song_revision(song_id)
    except Exception:
        revision = None

    try:
        chordpro = await songsterr.get_chordpro(song_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Songsterr API error: {exc}")

    if not chordpro:
        raise HTTPException(status_code=404, detail="No chord data available for this song")

    return ChordProResponse(
        song_id=song_id,
        artist=revision.artist if revision else "",
        title=revision.title if revision else "",
        chordpro=chordpro,
    )
