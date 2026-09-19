import { Hear } from './Fretboard';
import { physicalVoicing, sameVoicing } from './harmony';
import { PhysicalChordDiagram } from './PhysicalChordDiagram';
import type { ProgressionSurface, ProgressionResolved } from './progression';
import type { ProgressionIdea, ProgressionFocus } from '../types/v2';

export function ProgressionEditor({ idea, data, catalog, focus, busy, edit, beatsPerBar }: {
  idea: ProgressionIdea; data: ProgressionResolved; catalog: ProgressionSurface['catalog']; focus: ProgressionFocus | null;
  busy: boolean; edit: (value: Record<string, unknown>) => Promise<void>; beatsPerBar: number;
}) {
  function reorder(index: number, offset: number) {
    const order = idea.chords.map(step => step.id);
    [order[index], order[index + offset]] = [order[index + offset], order[index]];
    void edit({ order, focus: { kind: 'step', step_id: idea.chords[index].id } });
  }
  const index = Math.max(0, data.steps.findIndex(step => step.id === (focus?.kind === 'step' ? focus.step_id : focus?.from_step_id)));
  const step = data.steps[index];
  const assignedIndex = step?.voicings.findIndex(voicing => sameVoicing(voicing, step.voicing));
  return <section className="learning-progression-editor" aria-label="Progression editor">
    <ol>{step && <li className="learning-step" aria-label={`Step ${index + 1}`}>
      <div className="learning-step-heading"><span>{index + 1}</span><strong>{step.root} {step.quality}</strong><small>{step.function ?? 'No function label'}</small><Hear voicing={{ positions: step.positions, tuning: idea.tuning }} /></div>
      <PhysicalChordDiagram positions={step.positions} tuning={idea.tuning} label={`${step.root} ${step.quality}`} />
      <details className="learning-details"><summary>Edit chord</summary>
      <p className="learning-hint">{beatsPerBar} beats per bar</p>
      <div className="music-controls">
        <label>Chord root <select disabled={busy} value={step.root} onChange={event => void edit({ step_id: step.id, chord: { root: event.target.value, quality: step.quality } })}>{catalog.roots.map(root => <option key={root}>{root}</option>)}</select></label>
        <label>Quality <select disabled={busy} value={step.quality} onChange={event => void edit({ step_id: step.id, chord: { root: step.root, quality: event.target.value } })}>{catalog.qualities.map(quality => <option key={quality}>{quality}</option>)}</select></label>
        <label>Beats <input type="number" min="1" max="64" disabled={busy} value={step.duration_beats} onChange={event => void edit({ step_id: step.id, duration_beats: Number(event.target.value) })} style={{ width: '4rem' }} /></label>
      </div>
      <div className="music-controls"><label>Assigned voicing <select disabled={busy} value={step.voicing ? String(assignedIndex) : ''} onChange={event => { if (event.target.value !== '-1') void edit({ step_id: step.id, voicing: event.target.value === '' ? null : physicalVoicing(step.voicings[Number(event.target.value)]) }); }}>
        <option value="">Default playback</option>{step.voicing && assignedIndex === -1 && <option value="-1">Kept voicing</option>}
        {step.voicings.map((voicing, i) => <option key={i} value={i}>{voicing.label}</option>)}
      </select></label></div>
      <details className="learning-details"><summary>Choose a playable shape</summary><div className="learning-shapes">{step.voicings.map((voicing, index) => <div key={index}><h4>{voicing.label}</h4><PhysicalChordDiagram positions={voicing.positions} tuning={idea.tuning} label={`${step.root} ${step.quality} · ${voicing.label}`} selected={sameVoicing(voicing, step.voicing)} disabled={busy} onSelect={() => void edit({ step_id: step.id, voicing: physicalVoicing(voicing) })} /><Hear voicing={voicing} /></div>)}</div></details>
      <details className="learning-details"><summary>Reorder or remove this chord</summary><div className="music-controls">
        <button className="music-button" disabled={busy || index === 0} onClick={() => reorder(index, -1)}>Move earlier</button>
        <button className="music-button" disabled={busy || index === data.steps.length - 1} onClick={() => reorder(index, 1)}>Move later</button>
        <button className="music-button" disabled={busy} onClick={() => void edit({ remove: step.id })}>Remove chord</button>
      </div></details>
      </details>
    </li>}</ol>
    <button className="music-button" disabled={busy} onClick={() => void edit({ add: { root: 'C', quality: 'major' } })}>Add chord</button>
  </section>;
}
