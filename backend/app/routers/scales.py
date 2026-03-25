"""
Scales API routes.
"""

from fastapi import APIRouter, HTTPException, Query

from app.models.music import (
    ScalesListResponse,
    ScaleResponse,
    ScaleNotePosition,
    DiatonicChord,
)
from app.music.scales import (
    get_available_scales,
    get_scale_notes,
    get_scale_degree,
    get_diatonic_chords,
    SCALE_INTERVALS,
)
from app.music.notes import generate_fretboard
from app.music.tunings import TUNINGS, get_tuning_notes

router = APIRouter()


@router.get("/scales", response_model=ScalesListResponse)
async def get_scales():
    """Get list of all available scales."""
    return ScalesListResponse(scales=get_available_scales())


@router.get("/scales/{root}/{mode}", response_model=ScaleResponse)
async def get_scale(
    root: str,
    mode: str,
    tuning: str = Query(default="standard", description="Guitar tuning to use"),
):
    """
    Get scale information and fretboard positions.
    
    Args:
        root: Root note (e.g., "C", "F#", "Bb")
        mode: Scale mode (e.g., "major", "pentatonic_minor")
        tuning: Guitar tuning to use
    """
    # Validate root note
    valid_roots = ["C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#", "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B"]
    if root not in valid_roots:
        raise HTTPException(status_code=400, detail=f"Invalid root note: {root}")
    
    # Validate mode
    if mode not in SCALE_INTERVALS:
        raise HTTPException(status_code=400, detail=f"Invalid scale mode: {mode}")
    
    # Validate tuning
    if tuning not in TUNINGS:
        raise HTTPException(status_code=400, detail=f"Invalid tuning: {tuning}")
    
    # Get scale notes
    scale_notes = get_scale_notes(root, mode)
    
    # Get tuning notes and generate fretboard
    tuning_notes = get_tuning_notes(tuning)
    fretboard = generate_fretboard(tuning_notes)
    
    # Find all positions on fretboard that are in the scale
    positions = []
    
    # Normalize root for comparison
    flat_to_sharp = {"Db": "C#", "Eb": "D#", "Gb": "F#", "Ab": "G#", "Bb": "A#"}
    normalized_root = flat_to_sharp.get(root, root)
    
    for string_notes in fretboard:
        for note_pos in string_notes:
            # Check if this note is in the scale
            normalized_note = flat_to_sharp.get(note_pos["note"], note_pos["note"])
            
            if normalized_note in scale_notes:
                degree, degree_label = get_scale_degree(note_pos["note"], root, mode)
                is_root = normalized_note == normalized_root
                
                positions.append(ScaleNotePosition(
                    string=note_pos["string"],
                    fret=note_pos["fret"],
                    note=note_pos["note"],
                    is_root=is_root,
                    degree=degree,
                    degree_label=degree_label,
                ))
    
    # Get diatonic chords
    diatonic = get_diatonic_chords(root, mode)
    diatonic_chords = [
        DiatonicChord(**chord) for chord in diatonic
    ]
    
    return ScaleResponse(
        root=root,
        mode=mode,
        scale_notes=scale_notes,
        positions=positions,
        diatonic_chords=diatonic_chords,
    )
