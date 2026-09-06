"""Harmony derivation and value operations. No Artifact, Save, or model call."""
from pydantic import ValidationError
from app.music.chords import CHORD_INTERVALS, index_to_note
from app.music.scales import SCALE_INTERVALS, SCALE_DEGREE_NAMES, get_diatonic_chords
from app.services.chord_service import get_chord
from app.v2.concepts import CIRCLE_KEYS
from app.v2.harmony_state import ChordRef, HarmonyExploration, PinnedVoicing, TonalCenter, VoicingValue
from app.v2.workspace import NoteGroup, pitch_class, resolve_note_group, spelled_notes
from app.v2.workspace_caged import chord_caged_regions


def note_positions(notes: list[dict], tuning: list[int]) -> list[dict]:
    by_pitch = {note['pitch_class']: note for note in notes}
    return [{'string': string, 'fret': fret, 'midi': midi + fret, **by_pitch[(midi + fret) % 12]}
            for string, midi in enumerate(tuning, 1) for fret in range(20)
            if (midi + fret) % 12 in by_pitch]


def chord_notes(chord: ChordRef) -> list[dict]:
    formula = CHORD_INTERVALS[chord.quality]
    return spelled_notes(chord.root, formula['intervals'], formula['names'])


def chord_voicings(chord: ChordRef, tuning: list[int]) -> list[dict]:
    # Use the existing deterministic catalog path; filter physically invalid
    # results rather than claiming a standard-tuning shape works in any tuning.
    try:
        response = get_chord(index_to_note(pitch_class(chord.root)), chord.quality,
                             tuning_notes=','.join(index_to_note(midi) for midi in tuning))
    except LookupError:
        return []
    notes = {note['pitch_class']: note for note in chord_notes(chord)}
    result = []
    for voicing in response.voicings:
        # The catalog repeats each position an octave up for display. Playback
        # uses the original (lowest) position on each string exactly once.
        original = {}
        for position in sorted(voicing.positions, key=lambda p: p.fret):
            original.setdefault(position.string, position)
        positions = [{'string': p.string, 'fret': p.fret,
                      'midi': tuning[p.string - 1] + p.fret,
                      **notes[(tuning[p.string - 1] + p.fret) % 12]}
                     for p in original.values()
                     if 0 <= p.fret <= 24 and (tuning[p.string - 1] + p.fret) % 12 in notes]
        if len(positions) == len(original) and positions:
            result.append({'label': voicing.label, 'positions': positions, 'tuning': list(tuning)})
    return result


def resolve_harmony(exploration: HarmonyExploration) -> dict:
    center = exploration.tonal_center
    degrees, palette, circle = [], [], None
    if center:
        degrees = spelled_notes(center.root, SCALE_INTERVALS[center.scale], SCALE_DEGREE_NAMES[center.scale])
        palette = get_diatonic_chords(index_to_note(pitch_class(center.root)), center.scale)
        for index, chord in enumerate(palette):
            chord['root'] = degrees[index]['note']
            chord['display'] = chord['root'] + {'major': '', 'minor': 'm', 'diminished': '°', 'augmented': '+'}.get(chord['quality'], '')
        home = next(i for i, key in enumerate(CIRCLE_KEYS) if pitch_class(key) == pitch_class(center.root))
        circle = {'home': center.root, 'keys': CIRCLE_KEYS.copy(),
                  'neighbours': [CIRCLE_KEYS[(home - 1) % 12], CIRCLE_KEYS[(home + 1) % 12]]}
    focus = exploration.focus
    chord = focus.chord if focus.kind in ('chord', 'voicing') else None
    if focus.kind == 'degree' and center and focus.degree <= len(palette):
        chord = ChordRef(root=palette[focus.degree - 1]['root'], quality=palette[focus.degree - 1]['quality'])
    notes = chord_notes(chord) if chord else []
    by_pitch = {note['pitch_class']: note for note in notes}
    physical = []
    if focus.kind == 'voicing':
        for position in focus.voicing.positions:
            midi = exploration.tuning[position.string - 1] + position.fret
            physical.append({**position.model_dump(), 'midi': midi,
                             **by_pitch.get(midi % 12, {'pitch_class': midi % 12, 'note': index_to_note(midi)})})
    regions = chord_caged_regions(chord.root, chord.quality, exploration.tuning) if chord and chord.quality in ('major', 'minor') else []
    regions = [region for region in regions if all(0 <= p['fret'] <= 24 for p in region['positions'])]
    scratch = []
    for item in exploration.scratch:
        voicings = chord_voicings(item, exploration.tuning)
        scratch.append({**item.model_dump(), 'voicing': voicings[0] if voicings else None})
    function = next((item['numeral'] for item in palette if chord and pitch_class(item['root']) == pitch_class(chord.root) and all(note['pitch_class'] in {degree['pitch_class'] for degree in degrees} for note in notes)), None) if center else None
    return {'function': function, 'degrees': degrees, 'palette': palette, 'circle': circle,
            'scale_positions': note_positions(degrees, exploration.tuning),
            'chord_positions': note_positions(notes, exploration.tuning), 'chord_notes': notes,
            'voicing_positions': physical, 'caged_regions': regions,
            'voicings': chord_voicings(chord, exploration.tuning) if chord else [],
            'scratch': scratch, 'note_groups': [resolve_note_group(group, exploration.tuning) for group in exploration.kept_note_groups]}


def change_subject(state: HarmonyExploration, center: TonalCenter | dict | None) -> HarmonyExploration:
    return HarmonyExploration.model_validate(state.model_dump() | {
        'tonal_center': center, 'focus': {'kind': 'scale'}})


def change_tuning(state: HarmonyExploration, tuning: list[int]) -> HarmonyExploration:
    focus = state.focus.model_dump()
    if state.focus.kind == 'voicing' and state.focus.voicing.tuning != tuning:
        focus = {'kind': 'chord', 'chord': state.focus.chord.model_dump()}
    return HarmonyExploration.model_validate(state.model_dump() | {'tuning': tuning, 'focus': focus})


def transpose(state: HarmonyExploration, semitones: int) -> HarmonyExploration:
    if type(semitones) is not int:
        raise ValueError('Transpose interval must be an integer')
    data = state.model_dump()
    def shift(chord):
        chord['root'] = index_to_note(pitch_class(chord['root']) + semitones)
    if data['tonal_center']:
        shift(data['tonal_center'])
    for chord in data['scratch']:
        shift(chord)
    focus = data['focus']
    if focus['kind'] in ('chord', 'voicing'):
        shift(focus['chord'])
        if focus['kind'] == 'voicing':
            for position in focus['voicing']['positions']:
                position['fret'] += semitones
            try:
                VoicingValue.model_validate(focus['voicing'])
            except ValidationError:
                data['focus'] = {'kind': 'chord', 'chord': focus['chord']}
    return HarmonyExploration.model_validate(data)


def pin_voicing(state: HarmonyExploration, chord: ChordRef | dict, voicing: VoicingValue | dict) -> HarmonyExploration:
    pin = PinnedVoicing.model_validate({'chord': chord, 'voicing': voicing}).model_dump()
    data = state.model_dump()
    if pin not in data['pinned_voicings']:
        data['pinned_voicings'].append(pin)
    return HarmonyExploration.model_validate(data)


def unpin_voicing(state: HarmonyExploration, chord: ChordRef | dict, voicing: VoicingValue | dict) -> HarmonyExploration:
    pin = PinnedVoicing.model_validate({'chord': chord, 'voicing': voicing}).model_dump()
    data = state.model_dump()
    data['pinned_voicings'] = [value for value in data['pinned_voicings'] if value != pin]
    return HarmonyExploration.model_validate(data)


def add_kept_note_group(state: HarmonyExploration, group: NoteGroup | dict) -> HarmonyExploration:
    group = NoteGroup.model_validate(group).model_dump()
    data = state.model_dump()
    data['kept_note_groups'] = [value for value in data['kept_note_groups'] if value['id'] != group['id']] + [group]
    return HarmonyExploration.model_validate(data)
