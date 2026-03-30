const NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

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

/**
 * Convert Songsterr MIDI tuning array to note names.
 * Songsterr tuning is ordered high-to-low (string 1 to 6), same as app convention.
 */
export function midiTuningToNotes(midiTuning: number[]): string[] {
  return midiTuning.map((midi) => midiToNoteName(midi));
}

/**
 * Match a set of tuning notes against known tunings.
 * Compares by note index to handle enharmonic equivalents (e.g. D# vs Eb).
 */
export function matchTuningId(
  notes: string[],
  tunings: Array<{ id: string; notes: string[] }>,
): string | null {
  const noteToIndex = (n: string) => {
    const sharp: Record<string, string> = { 'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb' };
    const normalized = sharp[n] ?? n;
    return NOTE_NAMES.indexOf(normalized as typeof NOTE_NAMES[number]);
  };
  const target = notes.map(noteToIndex);
  for (const t of tunings) {
    const candidate = t.notes.map(noteToIndex);
    if (candidate.length === target.length && candidate.every((v, i) => v === target[i])) {
      return t.id;
    }
  }
  return null;
}

export function pickPrimaryTuning(
  tunings: Array<number[] | null | undefined>,
  options: { includeOctave?: boolean; lowToHigh?: boolean } = {},
): string | null {
  const first = tunings.find((tuning) => tuning && tuning.length > 0);
  if (!first) return null;
  return formatTuning(first, options);
}
