import type { ProgressionResolved } from './progression';

export function HarmonicFunction({ data }: { data: ProgressionResolved }) {
  return <section aria-label="Harmonic function"><h3>Harmonic function</h3>{data.key_status === 'Set a key' ? <p>Set a key</p> : <ol>{data.steps.map(step => <li key={step.id}>{step.root} {step.quality}: {step.function} {step.function_family && `· ${step.function_family}`}</li>)}</ol>}</section>;
}

export function VoiceLeading({ data, between, onFocus }: { data: ProgressionResolved; between?: unknown; onFocus: (from: string, to: string) => void }) {
  const target = between as { from_step_id?: string; to_step_id?: string } | undefined;
  const transitions = target ? data.transitions.filter(value => value.from_step_id === target.from_step_id && value.to_step_id === target.to_step_id) : data.transitions;
  return <section aria-label="Voice leading"><h3>Voice leading</h3>{transitions.length === 0 && <p>Choose adjacent steps.</p>}{transitions.map(value => <div key={value.from_step_id}>
    <button className="music-button" onClick={() => onFocus(value.from_step_id, value.to_step_id)}>Inspect transition</button>
    {value.assigned ? <><p>Assigned voicings: real motion</p><ul>{value.movement.map(voice => <li key={voice.string}>String {voice.string}: {voice.kind}{voice.semitones !== null && ` (${voice.semitones > 0 ? '+' : ''}${voice.semitones} semitones)`}</li>)}</ul></> : <><p>Chord-tone relationships; default playback is one possible realization.</p><p>Common tones: {value.shared_notes.join(', ') || 'none'} · Entering: {value.entering_notes.join(', ') || 'none'} · Leaving: {value.leaving_notes.join(', ') || 'none'}</p></>}
  </div>)}</section>;
}
