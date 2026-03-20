"""
Chords API routes.
"""

from fastapi import APIRouter, HTTPException

from app.models.music import (
    ChordResponse,
    CagedShapePosition,
    CagedShape,
    ChordQualitiesResponse,
    ChordQualityInfo,
)
from app.music.chords import (
    get_chord_notes,
    get_caged_positions,
    get_available_chord_qualities,
    CHORD_INTERVALS,
)

router = APIRouter()


@router.get("/chords/qualities", response_model=ChordQualitiesResponse)
async def get_chord_qualities():
    """Get list of available chord qualities."""
    qualities = get_available_chord_qualities()
    return ChordQualitiesResponse(
        qualities=[ChordQualityInfo(**q) for q in qualities]
    )


@router.get("/chords/{root}/{quality}", response_model=ChordResponse)
async def get_chord(root: str, quality: str):
    """
    Get chord information with all 5 CAGED shape positions.
    
    Args:
        root: Root note (e.g., "C", "F#", "Bb")
        quality: Chord quality (e.g., "major", "minor", "dominant7")
    """
    # Validate root note
    valid_roots = ["C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#", "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B"]
    if root not in valid_roots:
        raise HTTPException(status_code=400, detail=f"Invalid root note: {root}")
    
    # Validate quality
    if quality not in CHORD_INTERVALS:
        raise HTTPException(status_code=400, detail=f"Invalid chord quality: {quality}")
    
    # Get chord notes
    chord_notes = get_chord_notes(root, quality)
    
    # Get CAGED positions
    caged_shapes_data = get_caged_positions(root, quality)
    
    # Convert to response format
    caged_shapes = []
    for shape_data in caged_shapes_data:
        positions = [
            CagedShapePosition(
                string=pos["string"],
                fret=pos["fret"],
                note=pos["note"],
                interval=pos["interval"],
                is_root=pos["is_root"],
            )
            for pos in shape_data["positions"]
        ]
        
        caged_shapes.append(CagedShape(
            shape=shape_data["shape"],
            name=shape_data["name"],
            color=shape_data["color"],
            base_fret=shape_data["base_fret"],
            min_fret=shape_data["min_fret"],
            max_fret=shape_data["max_fret"],
            positions=positions,
        ))
    
    # Build display name
    quality_suffix = {
        "major": "", "minor": "m", "diminished": "°", "augmented": "+",
        "dominant7": "7", "major7": "maj7", "minor7": "m7",
    }.get(quality, quality)
    
    return ChordResponse(
        root=root,
        quality=quality,
        display_name=f"{root}{quality_suffix}",
        chord_notes=chord_notes,
        caged_shapes=caged_shapes,
    )
