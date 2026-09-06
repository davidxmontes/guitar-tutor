import { Hear } from './Fretboard';
import { physicalVoicing } from './harmony';
import type { ProgressionIdea, ProgressionSurface, ProgressionResolved, ProgressionFocus } from './progression';

export function ProgressionEditor({ idea, data, catalog, focus, busy, edit, beatsPerBar }: {
  idea: ProgressionIdea; data: ProgressionResolved; catalog: ProgressionSurface['catalog']; focus: ProgressionFocus | null;
  busy: boolean; edit: (value: Record<string, unknown>) => Promise<void>; beatsPerBar: number;
}) {
  function reorder(index: number, offset: number) {
    const order = idea.chords.map(step => step.id);
    [order[index], order[index + offset]] = [order[index + offset], order[index]];
    void edit({ order });
  }
  return <section aria-label="Progression editor"><h3>{idea.label}</h3><p>{beatsPerBar} beats per bar</p>
    <ol>{data.steps.map((step, index) => <li key={step.id} className="my-3" aria-label={`Step ${index + 1}`}>
      <div className="music-controls">
        <button className="music-button" disabled={busy} aria-pressed={focus?.kind === 'step' && focus.step_id === step.id} onClick={() => void edit({ focus: { kind: 'step', step_id: step.id } })}>Focus step {index + 1}</button>
        <label>Chord root <select disabled={busy} value={step.root} onChange={event => void edit({ step_id: step.id, chord: { root: event.target.value, quality: step.quality } })}>{catalog.roots.map(root => <option key={root}>{root}</option>)}</select></label>
        <label>Quality <select disabled={busy} value={step.quality} onChange={event => void edit({ step_id: step.id, chord: { root: step.root, quality: event.target.value } })}>{catalog.qualities.map(quality => <option key={quality}>{quality}</option>)}</select></label>
        <label>Beats <input type="number" min="1" max="64" disabled={busy} value={step.duration_beats} onChange={event => void edit({ step_id: step.id, duration_beats: Number(event.target.value) })} style={{ width: '4rem' }} /></label>
        <button className="music-button" disabled={busy || index === 0} onClick={() => reorder(index, -1)}>Move up</button>
        <button className="music-button" disabled={busy || index === data.steps.length - 1} onClick={() => reorder(index, 1)}>Move down</button>
        <button className="music-button" disabled={busy} onClick={() => void edit({ remove: step.id })}>Remove</button>
      </div>
      <div className="music-controls"><label>Assigned voicing <select disabled={busy} value={step.voicing ? JSON.stringify(physicalVoicing(step.voicing)) : ''} onChange={event => void edit({ step_id: step.id, voicing: event.target.value ? JSON.parse(event.target.value) : null })}>
        <option value="">Default playback</option>{step.voicing && !step.voicings.some(value => JSON.stringify(physicalVoicing(value)) === JSON.stringify(physicalVoicing(step.voicing!))) && <option value={JSON.stringify(physicalVoicing(step.voicing))}>Kept voicing</option>}
        {step.voicings.map((voicing, i) => <option key={i} value={JSON.stringify(physicalVoicing(voicing))}>{voicing.label}</option>)}
      </select></label><Hear voicing={{ positions: step.positions, tuning: idea.tuning }} /></div>
    </li>)}</ol>
    <button className="music-button" disabled={busy} onClick={() => void edit({ add: { root: 'C', quality: 'major' } })}>Add chord</button>
  </section>;
}
