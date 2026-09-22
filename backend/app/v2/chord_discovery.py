"""Deterministic interpretations and small, explicit edits of a learner's shape."""
from itertools import product

from app.music.chords import CHORD_INTERVALS, CHROMATIC_NOTES, _get_quality_suffix
from app.music.scales import SCALE_INTERVALS, SCALE_DEGREE_NAMES
from app.v2.harmony_state import ChordRef, HarmonyExploration
from app.v2.workspace import chromatic_note, pitch_class, spelled_notes


def chord_label(chord: ChordRef) -> str:
    return chord.root + _get_quality_suffix(chord.quality)


def chord_notes(chord: ChordRef) -> list[dict]:
    formula = CHORD_INTERVALS[chord.quality]
    return spelled_notes(chord.root, formula['intervals'], formula['names'])


def resolved_positions(positions: list[dict], tuning: list[int], chord: ChordRef | None = None) -> list[dict]:
    by_pitch = {n['pitch_class']: n for n in chord_notes(chord)} if chord else {}
    return [p | {'midi': tuning[p['string'] - 1] + p['fret']} |
            by_pitch.get((tuning[p['string'] - 1] + p['fret']) % 12,
                         chromatic_note(tuning[p['string'] - 1] + p['fret'])) for p in positions]


def shape_distance(candidate: list[dict], original: list[dict]) -> tuple:
    old = {p['string']: p['fret'] for p in original}
    new = {p['string']: p['fret'] for p in candidate}
    frets = [p['fret'] for p in candidate if p['fret']] or [0]
    middle = sum(p['fret'] for p in original) / max(1, len(original))
    return (sum(old.get(s) != new.get(s) for s in old.keys() | new.keys()),
            sum(abs(p['fret'] - middle) for p in candidate), max(frets) - min(frets),
            tuple(sorted(new.items())))


def proposed_shapes(original: list[dict], tuning: list[int], chord: ChordRef, *, replace: bool) -> list[list[dict]]:
    target = {n['pitch_class'] for n in chord_notes(chord)}
    kept = [p for p in original if (tuning[p['string'] - 1] + p['fret']) % 12 in target]
    bases = [kept]
    # ponytail: consider at most one extra string replacement; catalog shapes
    # cover larger changes instead of an exhaustive fingering search.
    if replace:
        bases += [kept[:i] + kept[i + 1:] for i in range(len(kept))]
    found = {}
    for base in bases:
        missing = target - {(tuning[p['string'] - 1] + p['fret']) % 12 for p in base}
        if len(missing) > 2:
            continue
        used = {p['string'] for p in base}
        options = [[{'string': s, 'fret': f} for s in range(1, 7) if s not in used
                    for f in range(25) if tuning[s - 1] + f <= 127 and (tuning[s - 1] + f) % 12 == pc]
                   for pc in sorted(missing)]
        for additions in product(*options):
            candidate = sorted([*base, *additions], key=lambda p: p['string'])
            if len({p['string'] for p in candidate}) != len(candidate):
                continue
            frets = [p['fret'] for p in candidate if p['fret']] or [0]
            original_frets = [p['fret'] for p in original if p['fret']] or [0]
            if max(frets) - min(frets) > max(5, max(original_frets) - min(original_frets)):
                continue
            if candidate == sorted(original, key=lambda p: p['string']):
                continue
            signature = tuple((p['string'], p['fret']) for p in candidate)
            found[signature] = candidate
    return sorted(found.values(), key=lambda p: shape_distance(p, original))[:3]


def suggestion(original: list[dict], positions: list[dict], tuning: list[int], chord: ChordRef, label: str | None = None) -> dict:
    old = {p['string']: p['fret'] for p in original}
    new = {p['string']: p for p in resolved_positions(positions, tuning, chord)}
    changes = []
    for string in sorted(old.keys() | new.keys()):
        before, after = old.get(string), new.get(string)
        if after is None:
            changes.append(f'Mute string {string}')
        elif before != after['fret']:
            changes.append(f"Add {after['note']} on string {string}, fret {after['fret']}" if before is None else
                           f"Move string {string}: {before} → {after['fret']} ({after['note']})")
    bass = min(new.values(), key=lambda p: p['midi'])
    name = chord_label(chord)
    return {'chord': chord.model_dump(), 'label': label or name, 'positions': positions,
            'notes': list(new.values()), 'changes': changes, 'bass': bass,
            'inversion': name if bass['pitch_class'] == pitch_class(chord.root) else f"{name}/{bass['note']}"}


def resolve_shape(state: HarmonyExploration, known_shapes: list[dict]) -> dict:
    focus = state.focus
    positions = [p.model_dump() for p in focus.positions]
    physical = resolved_positions(positions, state.tuning, focus.interpretation)
    selected = {p['pitch_class'] for p in physical}
    bass = min(physical, key=lambda p: p['midi']) if physical else None
    roots = dict(enumerate(CHROMATIC_NOTES))
    scale_pitches = set()
    if state.tonal_center:
        center = state.tonal_center
        for note in spelled_notes(center.root, SCALE_INTERVALS[center.scale], SCALE_DEGREE_NAMES[center.scale]):
            roots[note['pitch_class']] = note['note']
            scale_pitches.add(note['pitch_class'])
    if focus.interpretation:
        roots[pitch_class(focus.interpretation.root)] = focus.interpretation.root
    matches = []
    if len(selected) >= 2:
        for root in roots.values():
            for quality in CHORD_INTERVALS:
                chord = ChordRef(root=root, quality=quality)
                notes = chord_notes(chord)
                pitches = {n['pitch_class'] for n in notes}
                if not selected <= pitches or len(pitches - selected) > 2:
                    continue
                missing = [n for n in notes if n['pitch_class'] not in selected]
                bass_name = next(n['note'] for n in notes if n['pitch_class'] == bass['pitch_class'])
                matches.append({'chord': chord.model_dump(), 'label': chord_label(chord), 'notes': notes,
                                'inversion': chord_label(chord) if pitch_class(root) == bass['pitch_class'] else f'{chord_label(chord)}/{bass_name}',
                                'missing': missing, 'in_key': bool(scale_pitches) and pitches <= scale_pitches})
        matches.sort(key=lambda m: (len(m['missing']), not m['in_key'],
                                   pitch_class(m['chord']['root']) != bass['pitch_class'], m['label']))
    completions, alterations, voicings = [], [], []
    chosen = focus.interpretation
    if chosen:
        completions = [suggestion(positions, p, state.tuning, chosen)
                       for p in proposed_shapes(positions, state.tuning, chosen, replace=False)]
        chosen_pitches = {n['pitch_class'] for n in chord_notes(chosen)}
        for quality in CHORD_INTERVALS:
            other = ChordRef(root=chosen.root, quality=quality)
            other_pitches = {n['pitch_class'] for n in chord_notes(other)}
            if other == chosen or len(other_pitches ^ chosen_pitches) > 2:
                continue
            options = proposed_shapes(positions, state.tuning, other, replace=True)
            if options:
                alterations.append(suggestion(positions, options[0], state.tuning, other))
        alterations.sort(key=lambda s: shape_distance(s['positions'], positions))
        unique = {}
        for option in known_shapes:
            points = [{'string': p['string'], 'fret': p['fret']} for p in option['positions']]
            if any(not 0 <= p['fret'] <= 24 or not 0 <= state.tuning[p['string'] - 1] + p['fret'] <= 127 for p in points):
                continue
            if {(state.tuning[p['string'] - 1] + p['fret']) % 12 for p in points} != chosen_pitches:
                continue
            if sorted(points, key=lambda p: p['string']) == sorted(positions, key=lambda p: p['string']):
                continue
            signature = tuple(sorted((p['string'], p['fret']) for p in points))
            unique[signature] = suggestion(positions, points, state.tuning, chosen, option.get('label', 'Triad voicing'))
        voicings = sorted(unique.values(), key=lambda s: shape_distance(s['positions'], positions))
    interval = None
    if len(selected) == 2:
        other = next(p for p in selected if p != bass['pitch_class'])
        interval = ['unison', 'minor second', 'major second', 'minor third', 'major third', 'perfect fourth',
                    'tritone', 'perfect fifth', 'minor sixth', 'major sixth', 'minor seventh', 'major seventh'][(other - bass['pitch_class']) % 12]
    grid = resolved_positions([{'string': s, 'fret': f} for s in range(1, 7) for f in range(25)
                               if state.tuning[s - 1] + f <= 127], state.tuning)
    return {'positions': physical, 'grid': grid, 'bass': bass, 'interval': interval, 'matches': matches,
            'completions': completions, 'alterations': alterations, 'voicings': voicings}
