"""Scales API routes."""

from fastapi import APIRouter, HTTPException, Query

from app.models.music import ScaleResponse, ScalesListResponse
from app.music.scales import get_available_scales
from app.services.scale_service import get_scale

router = APIRouter()


@router.get("/scales", response_model=ScalesListResponse)
async def list_scales():
    """Get list of all available scales."""
    return ScalesListResponse(scales=get_available_scales())


@router.get("/scales/{root}/{mode}", response_model=ScaleResponse)
async def get_scale_endpoint(
    root: str,
    mode: str,
    tuning: str = Query(default="standard", description="Guitar tuning to use"),
    tuning_notes: str | None = Query(default=None, description="Comma-separated custom tuning notes, string 1 to 6"),
):
    """Get scale information and fretboard positions."""
    try:
        return get_scale(root, mode, tuning, tuning_notes)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
