from fastapi import APIRouter, Query

from app.models.schemas import FretboardResponse, NotePosition
from app.music.notes import generate_fretboard
from app.music.tunings import get_tuning_notes

router = APIRouter()

FRET_COUNT = 22


@router.get("/fretboard", response_model=FretboardResponse)
async def get_fretboard(
    tuning: str = Query(default="standard", description="Tuning ID (e.g., 'standard', 'drop_d')")
):
    """
    Get the complete fretboard with all note positions.
    
    Returns a chromatic grid for 6 strings × 23 positions (open + 22 frets).
    """
    tuning_notes = get_tuning_notes(tuning)
    fretboard_data = generate_fretboard(tuning_notes, FRET_COUNT)
    
    # Convert to response format
    strings = []
    for string_data in fretboard_data:
        string_positions = [
            NotePosition(
                string=pos["string"],
                fret=pos["fret"],
                note=pos["note"]
            )
            for pos in string_data
        ]
        strings.append(string_positions)
    
    return FretboardResponse(
        tuning=tuning,
        tuning_notes=tuning_notes,
        strings=strings,
        fret_count=FRET_COUNT,
    )
