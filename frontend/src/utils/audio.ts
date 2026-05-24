// Web Audio API-based guitar sound engine — Karplus-Strong synthesis

export type GuitarType = 'acoustic' | 'electric'

const VOICE_PARAMS: Record<GuitarType, { filterCoeff: number; decay: number; noiseAmp: number; preWarm: number }> = {
  acoustic: { filterCoeff: 0.5, decay: 0.996, noiseAmp: 1.0, preWarm: 0 },
  electric: { filterCoeff: 0.5, decay: 0.999, noiseAmp: 1.0, preWarm: 2 },
}

// Soft-clip curve for electric overdrive (tanh, amount=2 = light saturation)
const ELECTRIC_DISTORTION_CURVE: Float32Array<ArrayBuffer> = (() => {
  const amount = 2
  const n = 256
  const curve = new Float32Array(new ArrayBuffer(n * 4))
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1
    curve[i] = Math.tanh(amount * x) / Math.tanh(amount)
  }
  return curve
})()

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

// Module-level guitar type, initialized from localStorage
let guitarType: GuitarType = (
  typeof window !== 'undefined'
    ? (localStorage.getItem('guitarType') as GuitarType) ?? 'acoustic'
    : 'acoustic'
)

export function setGuitarType(type: GuitarType): void {
  guitarType = type
}

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
  return baseFreq * Math.pow(2, octave - 4)
}

// Audio context singleton
let audioContext: AudioContext | null = null

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext()
  }
  if (audioContext.state === 'suspended') {
    audioContext.resume()
  }
  return audioContext
}

// Karplus-Strong ring buffer synthesis
// Generates samples offline into an AudioBuffer and plays via BufferSourceNode.
// This avoids DelayNode's minimum-delay floor (~172 Hz at 44100 Hz sample rate),
// which would make low strings (E2=82 Hz, A2=110 Hz) sound wrong with real-time nodes.
function createKarplusString(
  ctx: AudioContext,
  frequency: number,
  startTime: number,
  duration: number,
  volume: number = 0.5
): void {
  const sampleRate = ctx.sampleRate
  const { filterCoeff, decay, noiseAmp, preWarm } = VOICE_PARAMS[guitarType]

  // Delay line length = one period at this frequency
  const N = Math.round(sampleRate / frequency)
  const totalSamples = Math.round(sampleRate * duration)

  // Seed delay line with white noise
  const delayLine = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    delayLine[i] = (Math.random() * 2 - 1) * noiseAmp
  }

  // Pre-warm: run the filter for preWarm full cycles before outputting.
  // This removes the initial wideband noise transient so the fundamental
  // is already established when the first sample plays.
  for (let i = 0; i < N * preWarm; i++) {
    const idx = i % N
    const nextIdx = (idx + 1) % N
    delayLine[idx] = filterCoeff * (delayLine[idx] + delayLine[nextIdx]) * decay
  }

  // Generate output via one-pole lowpass feedback loop
  const buffer = ctx.createBuffer(1, totalSamples, sampleRate)
  const channelData = buffer.getChannelData(0)

  for (let i = 0; i < totalSamples; i++) {
    const idx = i % N
    const nextIdx = (idx + 1) % N
    channelData[i] = delayLine[idx] * volume
    delayLine[idx] = filterCoeff * (delayLine[idx] + delayLine[nextIdx]) * decay
  }

  const source = ctx.createBufferSource()
  source.buffer = buffer

  if (guitarType === 'electric') {
    // Smooth the attack to avoid a sharp pick transient when distortion hits the onset
    const attackGain = ctx.createGain()
    attackGain.gain.setValueAtTime(0, startTime)
    attackGain.gain.linearRampToValueAtTime(1, startTime + 0.012)

    const waveshaper = ctx.createWaveShaper()
    waveshaper.curve = ELECTRIC_DISTORTION_CURVE
    waveshaper.oversample = '2x'
    const presence = ctx.createBiquadFilter()
    presence.type = 'peaking'
    presence.frequency.value = 2500
    presence.gain.value = 4
    presence.Q.value = 1.5
    source.connect(attackGain)
    attackGain.connect(waveshaper)
    waveshaper.connect(presence)
    presence.connect(ctx.destination)
  } else {
    source.connect(ctx.destination)
  }

  source.start(startTime)
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
  createKarplusString(ctx, frequency, ctx.currentTime, duration)
}

// Play a chord (strum style - slight delay between strings)
export function playChord(
  positions: NoteToPlay[],
  strumSpeed: number = 0.03,
  duration: number = 2.0
): void {
  const ctx = getAudioContext()
  const currentTime = ctx.currentTime

  // Sort by string (6 to 1, low to high for downstrum)
  const sorted = [...positions].sort((a, b) => b.string - a.string)

  sorted.forEach((pos, index) => {
    const frequency = getFrequency(pos.string, pos.fret)
    const startTime = currentTime + index * strumSpeed
    const volume = 0.4 / Math.sqrt(sorted.length / 4)
    createKarplusString(ctx, frequency, startTime, duration, volume)
  })
}

// Play chord arpeggiated (one note at a time)
export function playArpeggio(
  positions: NoteToPlay[],
  noteDelay: number = 0.2,
  noteDuration: number = 0.5,
  direction: 'up' | 'down' = 'up'
): void {
  const ctx = getAudioContext()
  const currentTime = ctx.currentTime

  let sorted = [...positions].sort((a, b) => b.string - a.string)
  if (direction === 'up') {
    sorted = sorted.reverse()
  }

  sorted.forEach((pos, index) => {
    const frequency = getFrequency(pos.string, pos.fret)
    const startTime = currentTime + index * noteDelay
    createKarplusString(ctx, frequency, startTime, noteDuration, 0.5)
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
    if (Math.abs(freq - lastFreq) > 1) {
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
    notesToPlay = [...unique, ...unique.slice(0, -1).reverse()]
  }

  notesToPlay.forEach((pos, index) => {
    const frequency = getFrequency(pos.string, pos.fret)
    const startTime = currentTime + index * noteDelay
    createKarplusString(ctx, frequency, startTime, noteDuration, 0.5)
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
