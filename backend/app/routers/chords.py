"""Chords API routes."""

from fastapi import APIRouter, HTTPException

from app.models.music import (
    ChordQualitiesResponse,
    ChordQualityInfo,
    ChordResponse,
    ChordVoicing,
    ChordVoicingPosition,
)
from app.music.chords import (
    CHORD_INTERVALS,
    _get_quality_suffix,
    get_available_chord_qualities,
    get_chord_notes,
)
from app.music.chords_db import get_voicing_positions

router = APIRouter()

VALID_ROOTS = [
    "C",
    "C#",
    "Db",
    "D",
    "D#",
    "Eb",
    "E",
    "F",
    "F#",
    "Gb",
    "G",
    "G#",
    "Ab",
    "A",
    "A#",
    "Bb",
    "B",
]


@router.get("/chords/qualities", response_model=ChordQualitiesResponse)
async def get_chord_qualities():
    """Get list of available chord qualities."""
    qualities = get_available_chord_qualities()
    return ChordQualitiesResponse(qualities=[ChordQualityInfo(**q) for q in qualities])


@router.get("/chords/{root}/{quality}", response_model=ChordResponse)
async def get_chord(root: str, quality: str):
    """
    Get chord information with voicings from chords-db.

    Args:
        root: Root note (e.g., "C", "F#", "Bb")
        quality: Chord quality (e.g., "major", "minor", "dominant7")
    """
    if root not in VALID_ROOTS:
        raise HTTPException(status_code=400, detail=f"Invalid root note: {root}")

    if quality not in CHORD_INTERVALS:
        raise HTTPException(status_code=400, detail=f"Invalid chord quality: {quality}")

    chord_notes = get_chord_notes(root, quality)
    voicing_data = get_voicing_positions(root, quality)

    if voicing_data is None:
        raise HTTPException(
            status_code=404,
            detail=f"Chord {root} {quality} not available in voicings database",
        )

    voicings = []
    for voicing in voicing_data:
        positions = [
            ChordVoicingPosition(
                string=pos["string"],
                fret=pos["fret"],
                note=pos["note"],
                interval=pos["interval"],
                is_root=pos["is_root"],
            )
            for pos in voicing["positions"]
        ]

        voicings.append(
            ChordVoicing(
                label=voicing["label"],
                name=voicing["name"],
                color=voicing["color"],
                base_fret=voicing["base_fret"],
                min_fret=voicing["min_fret"],
                max_fret=voicing["max_fret"],
                positions=positions,
            )
        )

    return ChordResponse(
        root=root,
        quality=quality,
        display_name=f"{root}{_get_quality_suffix(quality)}",
        chord_notes=chord_notes,
        voicings=voicings,
    )
