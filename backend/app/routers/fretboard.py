from fastapi import APIRouter, Query

from app.models.music import FretboardResponse, NotePosition
from app.music.notes import generate_fretboard
from app.music.tunings import get_tuning_notes

router = APIRouter()

FRET_COUNT = 22


@router.get("/fretboard", response_model=FretboardResponse)
async def get_fretboard(
    tuning: str = Query(default="standard", description="Tuning ID (e.g., 'standard', 'drop_d')"),
    tuning_notes: str | None = Query(default=None, description="Comma-separated custom tuning notes, string 1 to 6"),
):
    """
    Get the complete fretboard with all note positions.

    Returns a chromatic grid for 6 strings × 23 positions (open + 22 frets).
    """
    if tuning_notes:
        notes = [n.strip() for n in tuning_notes.split(",")]
        if len(notes) != 6:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="tuning_notes must have exactly 6 notes")
        resolved_notes = notes
        tuning = "custom"
    else:
        resolved_notes = get_tuning_notes(tuning)
    fretboard_data = generate_fretboard(resolved_notes, FRET_COUNT)
    
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
        tuning_notes=resolved_notes,
        strings=strings,
        fret_count=FRET_COUNT,
    )
