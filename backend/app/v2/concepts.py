"""Backend-owned Study catalog and deterministic scale/interval visuals."""

from typing import get_args

from app.music.chords import CHORD_INTERVALS, get_chord_notes, get_note_at_position, index_to_note, note_to_index
from app.music.notes import generate_fretboard
from app.music.scales import SCALE_DEGREE_NAMES, get_scale_notes
from app.services.chord_service import get_chord
from app.v2.models import (
    CircleState, CircleStudyPayload, CircleChord, CircleSequence, CircleKey, ProgressionChord,
    ChordConceptId,
    ChordQualityId,
    ChordStudyPayload,
    ChordStudyVoicing,
    CagedQualityId,
    CagedRegion,
    CagedShapeId,
    CagedStudyPayload,
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

CHORD_NAMES = {item["id"]: item["name"] for item in (
    {"id": "major", "name": "Major triad"},
    {"id": "minor", "name": "Minor triad"},
    {"id": "diminished", "name": "Diminished triad"},
    {"id": "augmented", "name": "Augmented triad"},
    {"id": "dominant7", "name": "Dominant seventh"},
    {"id": "major7", "name": "Major seventh"},
    {"id": "minor7", "name": "Minor seventh"},
    {"id": "dim7", "name": "Diminished seventh"},
    {"id": "m7b5", "name": "Half-diminished seventh"},
    {"id": "sus2", "name": "Suspended second"},
    {"id": "sus4", "name": "Suspended fourth"},
    {"id": "add9", "name": "Add nine"},
    {"id": "madd9", "name": "Minor add nine"},
    {"id": "7sus4", "name": "Seventh suspended fourth"},
    {"id": "6", "name": "Major sixth"},
    {"id": "m6", "name": "Minor sixth"},
    {"id": "9", "name": "Dominant ninth"},
    {"id": "m9", "name": "Minor ninth"},
    {"id": "maj9", "name": "Major ninth"},
)}

ESSENTIAL_CHORDS = ("major", "minor", "dominant7", "major7", "minor7", "sus2", "sus4")
ADVANCED_CHORDS = ("diminished", "augmented", "dim7", "m7b5", "7sus4", "6", "m6", "add9", "madd9", "9", "m9", "maj9")
DEFAULT_CHORD_COMPARISONS: dict[str, ChordQualityId] = {
    "major": "minor", "minor": "major", "diminished": "minor", "augmented": "major",
    "dominant7": "major7", "major7": "dominant7", "minor7": "minor",
    "dim7": "diminished", "m7b5": "diminished", "sus2": "major", "sus4": "major",
    "add9": "major", "madd9": "minor", "7sus4": "sus4", "6": "major",
    "m6": "minor", "9": "dominant7", "m9": "minor7", "maj9": "major7",
}

CAGED_SHAPES: tuple[CagedShapeId, ...] = ("C", "A", "G", "E", "D")
CAGED_ROOTS = {"C": "C", "A": "A", "G": "G", "E": "E", "D": "D"}
CAGED_POSITIONS: dict[CagedQualityId, dict[CagedShapeId, tuple[tuple[int, int], ...]]] = {
    "major": {
        "C": ((1, 0), (2, 1), (3, 0), (4, 2), (5, 3)),
        "A": ((1, 0), (2, 2), (3, 2), (4, 2), (5, 0)),
        "G": ((1, 3), (2, 0), (3, 0), (4, 0), (5, 2), (6, 3)),
        "E": ((1, 0), (2, 0), (3, 1), (4, 2), (5, 2), (6, 0)),
        "D": ((1, 2), (2, 3), (3, 2), (4, 0)),
    },
    "minor": {
        "C": ((1, 3), (2, 1), (3, 0), (4, 1), (5, 3)),
        "A": ((1, 0), (2, 1), (3, 2), (4, 2), (5, 0)),
        "G": ((1, 3), (2, 3), (3, 0), (4, 0), (5, 1), (6, 3)),
        "E": ((1, 0), (2, 0), (3, 0), (4, 2), (5, 2), (6, 0)),
        "D": ((1, 1), (2, 3), (3, 2), (4, 0)),
    },
}


def _catalog_concept(concept_id: ConceptId) -> StudyCatalogConcept:
    if concept_id.startswith("chord_"):
        quality = concept_id.removeprefix("chord_")
        return StudyCatalogConcept(
            id=concept_id,
            display_name=CHORD_NAMES[quality],
            description=f"Chord · {', '.join(CHORD_INTERVALS[quality]['names'])}",
            visualization="chord",
        )
    if concept_id == "circle":
        return StudyCatalogConcept(id=concept_id, display_name="Circle of Fifths", description="Keys, relative minors and diatonic harmony.", visualization="circle")
    if concept_id == "intervals":
        return StudyCatalogConcept(id=concept_id, display_name="Intervals", description="See each distance from a root across the neck.", visualization="interval")
    if concept_id == "caged":
        return StudyCatalogConcept(id=concept_id, display_name="CAGED", description="Five connected movable chord regions.", visualization="caged")
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
            )] + [_catalog_concept(f"chord_{quality}") for quality in ESSENTIAL_CHORDS]),
            StudyCatalogGroup(id="explore_more", display_name="Explore more", concepts=[_catalog_concept(item) for item in (
                "ionian", "dorian", "phrygian", "lydian", "mixolydian", "aeolian", "locrian", "harmonic_minor", "melodic_minor"
            )] + [_catalog_concept(f"chord_{quality}") for quality in ADVANCED_CHORDS]),
            StudyCatalogGroup(id="systems", display_name="Systems", concepts=[_catalog_concept("intervals"), _catalog_concept("caged"), _catalog_concept("circle")]),
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


def _chord_relationship(
    root: str,
    primary_quality: ChordQualityId,
    comparison_quality: ChordQualityId,
) -> ConceptRelationship:
    primary_notes = _notes(
        get_chord_notes(root, primary_quality),
        CHORD_INTERVALS[primary_quality]["names"],
    )
    comparison_notes = _notes(
        get_chord_notes(root, comparison_quality),
        CHORD_INTERVALS[comparison_quality]["names"],
    )
    primary_note_names = {note.note for note in primary_notes}
    comparison_note_names = {note.note for note in comparison_notes}
    added = [note for note in comparison_notes if note.note not in primary_note_names]
    removed = [note for note in primary_notes if note.note not in comparison_note_names]
    changes = []
    if added:
        changes.append(
            f"adds {', '.join(note.note for note in added)} "
            f"({', '.join(note.interval for note in added)})"
        )
    if removed:
        changes.append(
            f"removes {', '.join(note.note for note in removed)} "
            f"({', '.join(note.interval for note in removed)})"
        )
    return ConceptRelationship(
        id=comparison_quality,
        label=f"Compare with {root} {CHORD_NAMES[comparison_quality].lower()}",
        explanation=f"{CHORD_NAMES[comparison_quality]} {' and '.join(changes)}.",
        notes=added,
        positions=_positions(added),
    )


def _build_chord(
    root: str,
    concept_id: ChordConceptId,
    comparison_quality: ChordQualityId | None,
    selected_voicing: int,
    overlay: str,
) -> ChordStudyPayload:
    quality = concept_id.removeprefix("chord_")
    notes = _notes(get_chord_notes(root, quality), CHORD_INTERVALS[quality]["names"])
    resolved = get_chord(root, quality)
    voicings = [
        ChordStudyVoicing(
            label=voicing.label,
            name=voicing.name,
            positions=[
                ConceptPosition(**position.model_dump())
                for position in voicing.positions
                if position.fret == 0 or voicing.base_fret <= position.fret < voicing.base_fret + 4
            ],
        )
        for voicing in resolved.voicings
    ]
    if not 0 <= selected_voicing < len(voicings):
        raise ValueError(f"selected_voicing must be between 0 and {len(voicings) - 1}")
    available_comparison = comparison_quality or DEFAULT_CHORD_COMPARISONS[quality]
    if available_comparison == quality:
        raise ValueError("A chord cannot be compared with itself")
    return ChordStudyPayload(
        concept_id=concept_id,
        quality=quality,
        root=root,
        display_name=resolved.display_name,
        explanation=f"Chord tones: {', '.join(note.interval for note in notes)}.",
        tuning=TUNING,
        fret_start=FRET_START,
        fret_end=FRET_END,
        overlay=overlay,
        notes=notes,
        positions=_positions(notes),
        voicings=voicings,
        selected_voicing=selected_voicing,
        relationships=[_chord_relationship(root, quality, available_comparison)],
        comparison_quality=comparison_quality,
    )


def _build_caged(
    root: str,
    quality: CagedQualityId,
    selected_region: CagedShapeId,
    comparison_region: CagedShapeId | None,
    overlay: str,
) -> CagedStudyPayload:
    if quality not in CAGED_POSITIONS:
        raise ValueError(f"Unsupported CAGED quality: {quality}")
    if selected_region not in CAGED_SHAPES:
        raise ValueError(f"Unknown CAGED region: {selected_region}")
    if comparison_region not in (*CAGED_SHAPES, None):
        raise ValueError(f"Unknown CAGED region: {comparison_region}")
    if comparison_region == selected_region:
        raise ValueError("A CAGED region cannot be compared with itself")

    root_index = note_to_index(root)
    role_by_semitone = {0: "1", 3 if quality == "minor" else 4: "b3" if quality == "minor" else "3", 7: "5"}
    regions = []
    for shape in CAGED_SHAPES:
        offset = (root_index - note_to_index(CAGED_ROOTS[shape])) % 12
        positions = []
        for string, fret in CAGED_POSITIONS[quality][shape]:
            physical_fret = fret + offset
            note = get_note_at_position(string, physical_fret)
            interval = role_by_semitone.get((note_to_index(note) - root_index) % 12)
            if interval is None:
                raise ValueError(f"Invalid {quality} {shape}-shape position")
            positions.append(ConceptPosition(string=string, fret=physical_fret, note=note, interval=interval))
        expected_roles = {"1", "b3" if quality == "minor" else "3", "5"}
        if {position.interval for position in positions} != expected_roles:
            raise ValueError(f"Incomplete {quality} {shape}-shape region")
        regions.append(CagedRegion(
            shape=shape,
            label=f"{shape} shape",
            fret_start=min(position.fret for position in positions),
            fret_end=max(position.fret for position in positions),
            positions=positions,
        ))
    regions.sort(key=lambda region: (region.fret_start, CAGED_SHAPES.index(region.shape)))

    selected = next(region for region in regions if region.shape == selected_region)
    comparison = next((region for region in regions if region.shape == comparison_region), None)
    comparison_keys = {(position.string, position.fret) for position in comparison.positions} if comparison else set()
    overlap = [
        position for position in selected.positions
        if (position.string, position.fret) in comparison_keys
    ]
    visible = selected.positions + (comparison.positions if comparison else [])
    third = "b3" if quality == "minor" else "3"
    return CagedStudyPayload(
        root=root,
        quality=quality,
        display_name=f"{root} {quality} CAGED",
        explanation=f"Five connected chord regions labeled 1, {third}, and 5.",
        tuning=TUNING,
        fret_start=min(position.fret for position in visible),
        fret_end=max(position.fret for position in visible),
        overlay=overlay,
        notes=_notes(get_chord_notes(root, quality), ["1", third, "5"]),
        positions=selected.positions,
        regions=regions,
        selected_region=selected_region,
        comparison_region=comparison_region,
        overlap_positions=overlap,
    )


def build_concept_study(
    root: str,
    concept_id: ConceptId,
    *,
    comparison_id: ScaleConceptId | None = None,
    overlay: str = "notes",
    selected_interval: int = 7,
    selected_voicing: int = 0,
    comparison_quality: ChordQualityId | None = None,
    caged_quality: CagedQualityId = "major",
    selected_region: CagedShapeId = "C",
    comparison_region: CagedShapeId | None = None,
    selected_chord: int = 0,
    selected_sequence: str = "primary",
):
    """Build a validated visualization without persisting it."""

    root = index_to_note(note_to_index(root))
    if overlay not in {"notes", "intervals"}:
        raise ValueError(f"Unknown overlay: {overlay}")
    if not 0 <= selected_interval <= 11:
        raise ValueError("selected_interval must be between 0 and 11")
    if concept_id == "circle":
        return _build_circle(root, selected_chord, selected_sequence, overlay)
    if concept_id == "intervals":
        return _build_intervals(root, selected_interval, overlay)
    if concept_id == "caged":
        return _build_caged(root, caged_quality, selected_region, comparison_region, overlay)
    if concept_id in get_args(ChordConceptId):
        return _build_chord(root, concept_id, comparison_quality, selected_voicing, overlay)
    if concept_id not in get_args(ScaleConceptId):
        raise ValueError(f"Unknown concept: {concept_id}")
    if comparison_id == concept_id:
        raise ValueError("A scale cannot be compared with itself")
    return _build_scale(root, concept_id, comparison_id, overlay)


CIRCLE_KEYS = ["C", "G", "D", "A", "E", "B", "Gb", "Db", "Ab", "Eb", "Bb", "F"]


def _major_spelling(root: str) -> list[str]:
    letters = "CDEFGAB"
    naturals = [0, 2, 4, 5, 7, 9, 11]
    first = letters.index(root[0])
    notes = []
    for degree, semitones in enumerate(naturals):
        letter = (first + degree) % 7
        difference = (note_to_index(root) + semitones - naturals[letter]) % 12
        notes.append(letters[letter] + {0: "", 1: "#", 11: "b"}[difference])
    return notes


def _build_circle(root: str, selected_chord: int, selected_sequence: str, overlay: str) -> CircleStudyPayload:
    CircleState(root=root, selected_chord=selected_chord, selected_sequence=selected_sequence, overlay=overlay)
    scale = _major_spelling(root)
    numerals = ["I", "ii", "iii", "IV", "V", "vi", "vii°"]
    qualities = ["major", "minor", "minor", "major", "major", "minor", "diminished"]
    chords = []
    for degree, (name, quality) in enumerate(zip(scale, qualities)):
        pitch = (note_to_index(root) + [0,2,4,5,7,9,11][degree]) % 12
        notes = _notes([scale[(degree + offset) % 7] for offset in (0,2,4)], ["1", "3" if quality == "major" else "b3", "b5" if quality == "diminished" else "5"])
        voicing = None
        try:
            resolved = get_chord(index_to_note(pitch), quality)
            shape = resolved.voicings[0]
            voicing = [{"string": p.string, "fret": p.fret} for p in shape.positions if p.fret == 0 or shape.base_fret <= p.fret < shape.base_fret + 4]
        except LookupError:
            pass  # A missing reference shape does not remove deterministic harmony.
        chords.append(CircleChord(numeral=numerals[degree], notes=notes,
            chord=ProgressionChord(root=name, quality=quality, voicing=voicing, tuning="standard" if voicing else None)))
    selected = chords[selected_chord]
    selected_pitches = [(note_to_index(root) + [0,2,4,5,7,9,11][(selected_chord + offset) % 7]) % 12 for offset in (0,2,4)]
    positions = [ConceptPosition(string=p["string"], fret=p["fret"], **selected.notes[selected_pitches.index(note_to_index(p["note"]))].model_dump())
        for string in generate_fretboard(TUNING, FRET_END) for p in string
        if FRET_START <= p["fret"] <= FRET_END and note_to_index(p["note"]) in selected_pitches]
    order = ["F#", "C#", "G#", "D#", "A#", "E#", "B#"] if any("#" in note for note in scale) else ["Bb", "Eb", "Ab", "Db", "Gb", "Cb", "Fb"]
    return CircleStudyPayload(root=root, display_name=f"{root} major harmony", explanation="Choose a key, inspect its chords, then work on a sequence.",
        tuning=TUNING, fret_start=FRET_START, fret_end=FRET_END, overlay=overlay,
        relative_minor=scale[5], accidentals=[note for note in order if note in scale], neighbors=[scale[3],scale[4]],
        keys=[CircleKey(root=key, relative_minor=_major_spelling(key)[5]) for key in CIRCLE_KEYS], chords=chords,
        sequences=[CircleSequence(id="primary", label="I–IV–V", degrees=[0,3,4]), CircleSequence(id="pop", label="I–V–vi–IV", degrees=[0,4,5,3]), CircleSequence(id="turnaround", label="ii–V–I", degrees=[1,4,0])],
        selected_chord=selected_chord, selected_sequence=selected_sequence, notes=selected.notes, positions=positions)
