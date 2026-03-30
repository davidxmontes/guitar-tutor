"""Fretboard API routes."""

from fastapi import APIRouter, HTTPException, Query

from app.models.music import FretboardResponse
from app.services.fretboard_service import get_fretboard

router = APIRouter()


@router.get("/fretboard", response_model=FretboardResponse)
async def get_fretboard_endpoint(
    tuning: str = Query(default="standard", description="Tuning ID (e.g., 'standard', 'drop_d')"),
    tuning_notes: str | None = Query(default=None, description="Comma-separated custom tuning notes, string 1 to 6"),
):
    """Get the complete fretboard with all note positions."""
    try:
        return get_fretboard(tuning, tuning_notes)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
