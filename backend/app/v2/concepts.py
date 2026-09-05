"""Deterministic theory facts for the concrete ConceptStudy workspace."""

from app.music.chords import CHORD_INTERVALS, get_chord_notes, index_to_note, note_to_index
from app.music.notes import generate_fretboard
from app.music.scales import get_scale_notes
from app.v2.models import ConceptId, ConceptNote, ConceptPosition, ConceptRelationship, ConceptStudyPayload

TUNING = ["E", "B", "G", "D", "A", "E"]
FRET_START = 5
FRET_END = 8


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


def _relationship(id: str, label: str, explanation: str, notes: list[ConceptNote]) -> ConceptRelationship:
    return ConceptRelationship(id=id, label=label, explanation=explanation, notes=notes, positions=_positions(notes))


def build_concept_study(root: str, concept_id: ConceptId) -> ConceptStudyPayload:
    """Resolve one supported concept using the repo's existing theory math."""

    root = index_to_note(note_to_index(root))

    if concept_id == "pentatonic_minor":
        notes = _notes(get_scale_notes(root, concept_id), ["1", "b3", "4", "5", "b7"])
        natural_minor = _notes(get_scale_notes(root, "natural_minor"), ["1", "2", "b3", "4", "5", "b6", "b7"])
        added = [note for note in natural_minor if note.note not in {item.note for item in notes}]
        name = f"{root} minor pentatonic"
        explanation = "Five notes that outline the minor sound while leaving room between phrases."
        relationships = [
            _relationship(
                "natural_minor",
                f"Compare with {root} natural minor",
                f"Natural minor adds {', '.join(note.note for note in added)} ({', '.join(note.interval for note in added)}).",
                added,
            )
        ]
    elif concept_id in {"major_triad", "minor_triad"}:
        quality = "major" if concept_id == "major_triad" else "minor"
        other_quality = "minor" if quality == "major" else "major"
        notes = _notes(get_chord_notes(root, quality), CHORD_INTERVALS[quality]["names"])
        other = _notes(get_chord_notes(root, other_quality), CHORD_INTERVALS[other_quality]["names"])
        name = f"{root} {quality} triad"
        explanation = f"Root, {CHORD_INTERVALS[quality]['names'][1]}, and fifth define the {quality} triad."
        relationships = [
            _relationship(
                f"{other_quality}_triad",
                f"Compare with {root} {other_quality}",
                f"Only the third changes: {notes[1].note} becomes {other[1].note}.",
                other,
            )
        ]
    elif concept_id == "perfect_fifth":
        fifth = index_to_note(note_to_index(root) + 7)
        notes = _notes([root, fifth], ["1", "5"])
        fourth = _notes([root, index_to_note(note_to_index(root) + 5)], ["1", "4"])
        name = f"{root} perfect fifth"
        explanation = "A seven-semitone interval whose open sound anchors power chords and strong melodic leaps."
        relationships = [
            _relationship("perfect_fourth", f"Compare with {root} perfect fourth", "The upper note moves down two frets: 5 becomes 4.", fourth)
        ]
    else:
        dominant = index_to_note(note_to_index(root) + 7)
        notes = _notes(get_chord_notes(dominant, "dominant7"), CHORD_INTERVALS["dominant7"]["names"])
        tonic = _notes(get_chord_notes(root, "major"), CHORD_INTERVALS["major"]["names"])
        name = f"{dominant}7 → {root} dominant resolution"
        explanation = f"The dominant seventh creates tension that resolves into the {root} tonic triad."
        relationships = [
            _relationship("tonic", f"Resolve to {root}", "Compare the tense dominant tones with the stable tonic chord.", tonic)
        ]

    return ConceptStudyPayload(
        concept_id=concept_id,
        root=root,
        display_name=name,
        explanation=explanation,
        tuning=TUNING,
        fret_start=FRET_START,
        fret_end=FRET_END,
        notes=notes,
        positions=_positions(notes),
        relationships=relationships,
    )
