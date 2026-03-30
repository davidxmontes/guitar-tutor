"""Chords API routes."""

from fastapi import APIRouter, HTTPException, Query

from app.models.music import ChordQualitiesResponse, ChordQualityInfo, ChordResponse
from app.music.chords import get_available_chord_qualities
from app.services.chord_service import get_chord

router = APIRouter()


@router.get("/chords/qualities", response_model=ChordQualitiesResponse)
async def get_chord_qualities():
    """Get list of available chord qualities."""
    qualities = get_available_chord_qualities()
    return ChordQualitiesResponse(qualities=[ChordQualityInfo(**q) for q in qualities])


@router.get("/chords/{root}/{quality}", response_model=ChordResponse)
async def get_chord_endpoint(
    root: str,
    quality: str,
    tuning: str = Query(default="standard", description="Tuning ID"),
    tuning_notes: str | None = Query(default=None, description="Comma-separated custom tuning notes, string 1 to 6"),
):
    """Get chord information with voicings."""
    try:
        return get_chord(root, quality, tuning, tuning_notes)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
