from fastapi import APIRouter

from app.models.music import TuningsResponse, TuningInfo
from app.music.tunings import get_all_tunings

router = APIRouter()


@router.get("/tunings", response_model=TuningsResponse)
async def get_tunings():
    """
    Get all available guitar tunings.
    """
    tunings_data = get_all_tunings()
    
    tunings = [
        TuningInfo(
            id=t["id"],
            name=t["name"],
            notes=t["notes"]
        )
        for t in tunings_data
    ]
    
    return TuningsResponse(tunings=tunings)
