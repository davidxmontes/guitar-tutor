"""
Guitar tuning definitions.
"""

# Standard tuning and common alternatives
# Notes are ordered from string 1 (high E) to string 6 (low E)
TUNINGS = {
    "standard": {
        "id": "standard",
        "name": "Standard",
        "notes": ["E", "B", "G", "D", "A", "E"],
    },
    "drop_d": {
        "id": "drop_d",
        "name": "Drop D",
        "notes": ["E", "B", "G", "D", "A", "D"],
    },
    "half_step_down": {
        "id": "half_step_down",
        "name": "Half Step Down",
        "notes": ["D#", "A#", "F#", "C#", "G#", "D#"],
    },
    "full_step_down": {
        "id": "full_step_down",
        "name": "Full Step Down",
        "notes": ["D", "A", "F", "C", "G", "D"],
    },
    "open_g": {
        "id": "open_g",
        "name": "Open G",
        "notes": ["D", "B", "G", "D", "G", "D"],
    },
    "open_d": {
        "id": "open_d",
        "name": "Open D",
        "notes": ["D", "A", "F#", "D", "A", "D"],
    },
    "dadgad": {
        "id": "dadgad",
        "name": "DADGAD",
        "notes": ["D", "A", "G", "D", "A", "D"],
    },
}


def get_tuning(tuning_id: str) -> dict | None:
    """Get tuning by ID."""
    return TUNINGS.get(tuning_id)


def get_all_tunings() -> list[dict]:
    """Get all available tunings."""
    return list(TUNINGS.values())


def get_tuning_notes(tuning_id: str) -> list[str]:
    """Get the notes for a tuning."""
    tuning = TUNINGS.get(tuning_id, TUNINGS["standard"])
    return tuning["notes"]
