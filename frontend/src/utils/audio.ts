// Web Audio API-based guitar sound engine

// Note frequencies (A4 = 440Hz)
const NOTE_FREQUENCIES: Record<string, number> = {
  'C': 261.63,
  'C#': 277.18, 'Db': 277.18,
  'D': 293.66,
  'D#': 311.13, 'Eb': 311.13,
  'E': 329.63,
  'F': 349.23,
  'F#': 369.99, 'Gb': 369.99,
  'G': 392.00,
  'G#': 415.30, 'Ab': 415.30,
  'A': 440.00,
  'A#': 466.16, 'Bb': 466.16,
  'B': 493.88,
}

// Standard tuning frequencies for each string (low to high: E2, A2, D3, G3, B3, E4)
const STRING_BASE_FREQUENCIES = [
  82.41,   // String 6 (low E) - E2
  110.00,  // String 5 (A) - A2
  146.83,  // String 4 (D) - D3
  196.00,  // String 3 (G) - G3
  246.94,  // String 2 (B) - B3
  329.63,  // String 1 (high E) - E4
]

// Get frequency for a specific string and fret
export function getFrequency(string: number, fret: number): number {
  // String is 1-indexed (1 = high E, 6 = low E)
  const baseFreq = STRING_BASE_FREQUENCIES[6 - string]
  // Each fret is a semitone (multiply by 2^(1/12))
  return baseFreq * Math.pow(2, fret / 12)
}

// Get frequency for a note name with octave adjustment
export function getNoteFrequency(note: string, octave: number = 4): number {
  const baseFreq = NOTE_FREQUENCIES[note] || NOTE_FREQUENCIES['A']
  // Adjust for octave (base frequencies are for octave 4)
  return baseFreq * Math.pow(2, octave - 4)
}

// Audio context singleton
let audioContext: AudioContext | null = null

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext()
  }
  // Resume if suspended (browser autoplay policy)
  if (audioContext.state === 'suspended') {
    audioContext.resume()
  }
  return audioContext
}

// Create a guitar-like tone using multiple oscillators
function createGuitarTone(
  ctx: AudioContext,
  frequency: number,
  startTime: number,
  duration: number,
  volume: number = 0.3
): void {
  // Master gain
  const masterGain = ctx.createGain()
  masterGain.connect(ctx.destination)
  masterGain.gain.setValueAtTime(0, startTime)
  
  // Attack-Decay-Sustain-Release envelope
  const attackTime = 0.005
  const decayTime = 0.1
  const sustainLevel = 0.6
  const releaseTime = duration * 0.5
  
  masterGain.gain.linearRampToValueAtTime(volume, startTime + attackTime)
  masterGain.gain.linearRampToValueAtTime(volume * sustainLevel, startTime + attackTime + decayTime)
  masterGain.gain.setValueAtTime(volume * sustainLevel, startTime + duration - releaseTime)
  masterGain.gain.linearRampToValueAtTime(0, startTime + duration)
  
  // Fundamental frequency
  const osc1 = ctx.createOscillator()
  osc1.type = 'triangle'
  osc1.frequency.setValueAtTime(frequency, startTime)
  
  // Second harmonic (octave)
  const osc2 = ctx.createOscillator()
  osc2.type = 'sine'
  osc2.frequency.setValueAtTime(frequency * 2, startTime)
  
  // Third harmonic
  const osc3 = ctx.createOscillator()
  osc3.type = 'sine'
  osc3.frequency.setValueAtTime(frequency * 3, startTime)
  
  // Individual gains for harmonics
  const gain1 = ctx.createGain()
  gain1.gain.setValueAtTime(1.0, startTime)
  
  const gain2 = ctx.createGain()
  gain2.gain.setValueAtTime(0.5, startTime)
  
  const gain3 = ctx.createGain()
  gain3.gain.setValueAtTime(0.25, startTime)
  
  // Connect oscillators through gains
  osc1.connect(gain1)
  osc2.connect(gain2)
  osc3.connect(gain3)
  
  gain1.connect(masterGain)
  gain2.connect(masterGain)
  gain3.connect(masterGain)
  
  // Start and stop
  osc1.start(startTime)
  osc2.start(startTime)
  osc3.start(startTime)
  
  osc1.stop(startTime + duration + 0.1)
  osc2.stop(startTime + duration + 0.1)
  osc3.stop(startTime + duration + 0.1)
}

// Position type for playing
export interface NoteToPlay {
  string: number
  fret: number
  note?: string
}

// Play a single note
export function playNote(string: number, fret: number, duration: number = 1.0): void {
  const ctx = getAudioContext()
  const frequency = getFrequency(string, fret)
  createGuitarTone(ctx, frequency, ctx.currentTime, duration)
}

// Play a chord (strum style - slight delay between strings)
export function playChord(
  positions: NoteToPlay[],
  strumSpeed: number = 0.03, // Time between each string (seconds)
  duration: number = 2.0
): void {
  const ctx = getAudioContext()
  const currentTime = ctx.currentTime
  
  // Sort by string (6 to 1, low to high for downstrum)
  const sorted = [...positions].sort((a, b) => b.string - a.string)
  
  sorted.forEach((pos, index) => {
    const frequency = getFrequency(pos.string, pos.fret)
    const startTime = currentTime + index * strumSpeed
    // Slightly reduce volume for more notes to prevent clipping
    const volume = 0.25 / Math.sqrt(sorted.length / 4)
    createGuitarTone(ctx, frequency, startTime, duration, volume)
  })
}

// Play chord arpeggiated (one note at a time)
export function playArpeggio(
  positions: NoteToPlay[],
  noteDelay: number = 0.2, // Time between each note
  noteDuration: number = 0.5,
  direction: 'up' | 'down' = 'up'
): void {
  const ctx = getAudioContext()
  const currentTime = ctx.currentTime
  
  // Sort by string
  let sorted = [...positions].sort((a, b) => b.string - a.string)
  if (direction === 'up') {
    sorted = sorted.reverse()
  }
  
  sorted.forEach((pos, index) => {
    const frequency = getFrequency(pos.string, pos.fret)
    const startTime = currentTime + index * noteDelay
    createGuitarTone(ctx, frequency, startTime, noteDuration, 0.3)
  })
}

// Play a scale (ascending or descending)
export function playScale(
  positions: NoteToPlay[],
  noteDelay: number = 0.25,
  noteDuration: number = 0.4,
  direction: 'ascending' | 'descending' | 'both' = 'ascending'
): void {
  const ctx = getAudioContext()
  const currentTime = ctx.currentTime
  
  // Sort positions by pitch (string then fret)
  // Lower string number = higher pitch for same fret
  // Higher fret = higher pitch for same string
  const sorted = [...positions].sort((a, b) => {
    const freqA = getFrequency(a.string, a.fret)
    const freqB = getFrequency(b.string, b.fret)
    return freqA - freqB
  })
  
  // Remove duplicates (same pitch from different positions)
  const unique: NoteToPlay[] = []
  let lastFreq = 0
  sorted.forEach(pos => {
    const freq = getFrequency(pos.string, pos.fret)
    if (Math.abs(freq - lastFreq) > 1) { // Allow 1Hz tolerance
      unique.push(pos)
      lastFreq = freq
    }
  })
  
  let notesToPlay: NoteToPlay[] = []
  
  if (direction === 'ascending') {
    notesToPlay = unique
  } else if (direction === 'descending') {
    notesToPlay = [...unique].reverse()
  } else {
    // Both: ascending then descending (skip last note to avoid repeat)
    notesToPlay = [...unique, ...unique.slice(0, -1).reverse()]
  }
  
  notesToPlay.forEach((pos, index) => {
    const frequency = getFrequency(pos.string, pos.fret)
    const startTime = currentTime + index * noteDelay
    createGuitarTone(ctx, frequency, startTime, noteDuration, 0.3)
  })
}

// Get total duration of scale playback
export function getScaleDuration(
  positionCount: number,
  noteDelay: number = 0.25,
  noteDuration: number = 0.4,
  direction: 'ascending' | 'descending' | 'both' = 'ascending'
): number {
  const count = direction === 'both' ? positionCount * 2 - 1 : positionCount
  return count * noteDelay + noteDuration
}

// Get total duration of chord playback
export function getChordDuration(
  positionCount: number,
  strumSpeed: number = 0.03,
  duration: number = 2.0
): number {
  return positionCount * strumSpeed + duration
}
