"""Backend-owned Study catalog and deterministic scale/interval visuals."""

from typing import get_args

from app.music.chords import index_to_note, note_to_index
from app.music.notes import generate_fretboard
from app.music.scales import SCALE_DEGREE_NAMES, get_scale_notes
from app.v2.models import (
    ConceptId,
    ConceptNote,
    ConceptPosition,
    ConceptRelationship,
    IntervalStudyPayload,
    ScaleConceptId,
    ScaleStudyPayload,
    StudyCatalog,
    StudyCatalogConcept,
    StudyCatalogGroup,
    StudyInterval,
)

TUNING = ["E", "B", "G", "D", "A", "E"]
FRET_START = 5
FRET_END = 8
ROOTS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]

SCALE_NAMES: dict[str, str] = {
    "major": "Major scale",
    "ionian": "Ionian mode",
    "dorian": "Dorian mode",
    "phrygian": "Phrygian mode",
    "lydian": "Lydian mode",
    "mixolydian": "Mixolydian mode",
    "aeolian": "Aeolian mode",
    "natural_minor": "Natural minor scale",
    "locrian": "Locrian mode",
    "harmonic_minor": "Harmonic minor scale",
    "melodic_minor": "Melodic minor scale",
    "pentatonic_major": "Major pentatonic",
    "pentatonic_minor": "Minor pentatonic",
    "blues": "Blues scale",
}

DEFAULT_COMPARISONS: dict[str, ScaleConceptId] = {
    "major": "natural_minor", "ionian": "dorian", "dorian": "major",
    "phrygian": "natural_minor", "lydian": "major", "mixolydian": "major",
    "aeolian": "major", "natural_minor": "major", "locrian": "natural_minor",
    "harmonic_minor": "natural_minor", "melodic_minor": "natural_minor",
    "pentatonic_major": "major", "pentatonic_minor": "natural_minor",
    "blues": "pentatonic_minor",
}

INTERVAL_LABELS = ["1", "b2", "2", "b3", "3", "4", "b5", "5", "b6", "6", "b7", "7"]
INTERVAL_NAMES = [
    "Unison", "Minor second", "Major second", "Minor third", "Major third", "Perfect fourth",
    "Tritone", "Perfect fifth", "Minor sixth", "Major sixth", "Minor seventh", "Major seventh",
]


def _catalog_concept(concept_id: ConceptId) -> StudyCatalogConcept:
    if concept_id == "intervals":
        return StudyCatalogConcept(id=concept_id, display_name="Intervals", description="See each distance from a root across the neck.", visualization="interval")
    return StudyCatalogConcept(
        id=concept_id,
        display_name=SCALE_NAMES[concept_id],
        description=f"{len(get_scale_notes('C', concept_id))} notes · {', '.join(SCALE_DEGREE_NAMES[concept_id])}",
        visualization="scale",
    )


def get_study_catalog() -> StudyCatalog:
    return StudyCatalog(
        roots=ROOTS,
        groups=[
            StudyCatalogGroup(id="essentials", display_name="Essentials", concepts=[_catalog_concept(item) for item in (
                "major", "natural_minor", "pentatonic_major", "pentatonic_minor", "blues"
            )]),
            StudyCatalogGroup(id="explore_more", display_name="Explore more", concepts=[_catalog_concept(item) for item in (
                "ionian", "dorian", "phrygian", "lydian", "mixolydian", "aeolian", "locrian", "harmonic_minor", "melodic_minor"
            )]),
            StudyCatalogGroup(id="systems", display_name="Systems", concepts=[_catalog_concept("intervals")]),
        ],
    )


def _notes(note_names: list[str], intervals: list[str]) -> list[ConceptNote]:
    return [ConceptNote(note=note, interval=interval) for note, interval in zip(note_names, intervals)]


def _positions(notes: list[ConceptNote]) -> list[ConceptPosition]:
    intervals = {note.note: note.interval for note in notes}
    return [
        ConceptPosition(string=position["string"], fret=position["fret"], note=position["note"], interval=intervals[position["note"]])
        for string_positions in generate_fretboard(TUNING, FRET_END)
        for position in string_positions
        if FRET_START <= position["fret"] <= FRET_END and position["note"] in intervals
    ]


def _scale_relationship(root: str, concept_id: ScaleConceptId, comparison_id: ScaleConceptId) -> ConceptRelationship:
    primary = _notes(get_scale_notes(root, concept_id), SCALE_DEGREE_NAMES[concept_id])
    comparison = _notes(get_scale_notes(root, comparison_id), SCALE_DEGREE_NAMES[comparison_id])
    primary_names = {item.note for item in primary}
    comparison_names = {item.note for item in comparison}
    added = [item for item in comparison if item.note not in primary_names]
    removed = [item for item in primary if item.note not in comparison_names]
    changes = []
    if added:
        changes.append(f"adds {', '.join(item.note for item in added)} ({', '.join(item.interval for item in added)})")
    if removed:
        changes.append(f"removes {', '.join(item.note for item in removed)} ({', '.join(item.interval for item in removed)})")
    return ConceptRelationship(
        id=comparison_id,
        label=f"Compare with {root} {SCALE_NAMES[comparison_id].lower()}",
        explanation=f"{SCALE_NAMES[comparison_id].removesuffix(' scale').removesuffix(' mode')} {' and '.join(changes)}.",
        notes=added,
        positions=_positions(added),
    )


def _build_scale(root: str, concept_id: ScaleConceptId, comparison_id: ScaleConceptId | None, overlay: str) -> ScaleStudyPayload:
    notes = _notes(get_scale_notes(root, concept_id), SCALE_DEGREE_NAMES[concept_id])
    available_comparison = comparison_id or DEFAULT_COMPARISONS[concept_id]
    suffix = SCALE_NAMES[concept_id].removesuffix(" scale").removesuffix(" mode")
    display_name = f"{root} {suffix}"
    if concept_id == "pentatonic_minor":
        display_name = f"{root} minor pentatonic"
    return ScaleStudyPayload(
        concept_id=concept_id,
        root=root,
        display_name=display_name,
        explanation=f"{len(notes)} notes: {', '.join(item.interval for item in notes)}.",
        tuning=TUNING,
        fret_start=FRET_START,
        fret_end=FRET_END,
        overlay=overlay,
        notes=notes,
        positions=_positions(notes),
        relationships=[_scale_relationship(root, concept_id, available_comparison)],
        comparison_id=comparison_id,
    )


def _build_intervals(root: str, selected_interval: int, overlay: str) -> IntervalStudyPayload:
    root_index = note_to_index(root)
    intervals = [
        StudyInterval(
            note=index_to_note(root_index + semitones),
            label=INTERVAL_LABELS[semitones],
            name=INTERVAL_NAMES[semitones],
            semitones=semitones,
        )
        for semitones in range(12)
    ]
    selected_notes = _notes([root, intervals[selected_interval].note], ["1", INTERVAL_LABELS[selected_interval]])
    return IntervalStudyPayload(
        root=root,
        display_name=f"Intervals from {root}",
        explanation="Choose a distance to see both notes together across the fretboard.",
        tuning=TUNING,
        fret_start=FRET_START,
        fret_end=FRET_END,
        overlay=overlay,
        selected_interval=selected_interval,
        intervals=intervals,
        positions=_positions(selected_notes),
    )


def build_concept_study(
    root: str,
    concept_id: ConceptId,
    *,
    comparison_id: ScaleConceptId | None = None,
    overlay: str = "notes",
    selected_interval: int = 7,
):
    """Build a validated visualization without persisting it."""

    root = index_to_note(note_to_index(root))
    if overlay not in {"notes", "intervals"}:
        raise ValueError(f"Unknown overlay: {overlay}")
    if concept_id == "intervals":
        return _build_intervals(root, selected_interval, overlay)
    if concept_id not in get_args(ScaleConceptId):
        raise ValueError(f"Unknown concept: {concept_id}")
    if comparison_id == concept_id:
        raise ValueError("A scale cannot be compared with itself")
    return _build_scale(root, concept_id, comparison_id, overlay)
