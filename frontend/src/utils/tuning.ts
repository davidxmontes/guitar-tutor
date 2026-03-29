const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

export function midiToNoteName(midi: number, includeOctave: boolean = false): string {
  if (!Number.isFinite(midi)) return '?';
  const noteIndex = ((Math.round(midi) % 12) + 12) % 12;
  const note = NOTE_NAMES[noteIndex];
  if (!includeOctave) return note;

  const octave = Math.floor(Math.round(midi) / 12) - 1;
  return `${note}${octave}`;
}

export function formatTuning(
  tuning: number[] | null | undefined,
  options: { includeOctave?: boolean; lowToHigh?: boolean } = {},
): string | null {
  if (!tuning || tuning.length === 0) return null;

  const { includeOctave = false, lowToHigh = true } = options;
  const ordered = lowToHigh ? [...tuning].reverse() : [...tuning];
  return ordered.map((midi) => midiToNoteName(midi, includeOctave)).join(' ');
}

export function pickPrimaryTuning(
  tunings: Array<number[] | null | undefined>,
  options: { includeOctave?: boolean; lowToHigh?: boolean } = {},
): string | null {
  const first = tunings.find((tuning) => tuning && tuning.length > 0);
  if (!first) return null;
  return formatTuning(first, options);
}
