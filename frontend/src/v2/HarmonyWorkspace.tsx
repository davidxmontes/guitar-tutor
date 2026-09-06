import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import type { V2Branch } from '../types/v2';
import { CompositionView } from './Composition';
import { Fretboard } from './Fretboard';
import type { ResolvedNote } from './Fretboard';
import { ComparisonView, Explanation, WorkspaceHeader } from './SharedBlocks';
import { useCompare } from './compare';
import type { HarmonySurface } from './harmony';

export function HarmonyWorkspace({ branch, onChange }: { branch: V2Branch; onChange: (branch: V2Branch) => void }) {
  const [surface, setSurface] = useState<HarmonySurface | null>(null);
  const [error, setError] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const compare = useCompare();
  useEffect(() => {
    let cancelled = false;
    apiClient.getHarmony(branch.session_id, branch.id).then(value => { if (!cancelled) setSurface(value); }).catch(err => { if (!cancelled) setError(String(err)); });
    return () => { cancelled = true; };
  }, [branch.id, branch.session_id]);
  async function edit(fields: Record<string, unknown>) {
    setBusy(true); setError('');
    try {
      const value = await apiClient.editHarmony(branch.session_id, branch.id, fields);
      setSurface(value); onChange(value.branch);
    } catch (err) { setError(String(err)); } finally { setBusy(false); }
  }
  async function ask() {
    if (!question.trim()) return;
    setBusy(true); setError('');
    try {
      const result = await apiClient.sendTutorTurn({ session_id: branch.session_id, branch_id: branch.id, message: question });
      setAnswer(result.message); setQuestion('');
      const value = await apiClient.getHarmony(branch.session_id, branch.id);
      setSurface(value); onChange(value.branch);
    } catch (err) { setError(String(err)); } finally { setBusy(false); }
  }
  if (!surface) return <p role="status">{error || 'Loading Harmony…'}</p>;
  const state = surface.branch.harmony_exploration!;
  const root = String(state.tonal_center?.root ?? 'C');
  const scale = String(state.tonal_center?.scale ?? 'major');
  const focus = state.focus;
  const chord = focus.chord as { root: string; quality: string } | undefined;
  const focusLabel = focus.kind === 'degree' ? `degree ${focus.degree}` : chord ? `${chord.root} ${chord.quality}` : state.tonal_center ? `${root} ${scale.replaceAll('_', ' ')}` : 'Choose a tonal centre';
  const data = surface.resolved;
  const notes = focus.kind === 'voicing' ? data.voicing_positions : focus.kind === 'chord' ? data.chord_positions : data.scale_positions;
  return <section data-testid="harmony-workspace" aria-busy={busy}>
    <WorkspaceHeader title="Harmony" focus={focusLabel} onBack={focus.kind === 'scale' ? undefined : () => void edit({ focus: { kind: 'scale' } })}>
      <label>Root <select aria-label="Root" value={state.tonal_center ? root : ''} disabled={busy} onChange={e => void edit({ tonal_center: { root: e.target.value, scale } })}><option value="" disabled>Choose root</option>{surface.catalog.roots.map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Scale <select aria-label="Scale" value={scale} disabled={busy || !state.tonal_center} onChange={e => void edit({ tonal_center: { root, scale: e.target.value } })}>{Object.entries(surface.catalog.scales).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Tuning <select aria-label="Tuning" disabled={busy} value={state.tuning[5] === 38 ? 'drop-d' : 'standard'} onChange={e => void edit({ tuning: [64, 59, 55, 50, 45, e.target.value === 'drop-d' ? 38 : 40] })}><option value="standard">Standard</option><option value="drop-d">Drop D</option></select></label>
      <button className="music-button" disabled={!state.tonal_center || busy} onClick={() => compare.toggle({ kind: 'scale', id: `${root}:${scale}`, label: `${root} ${scale}`, positions: data.scale_positions })}>Compare current scale</button>
    </WorkspaceHeader>
    <p data-testid="scratch-count">{state.scratch.length} scratch chord{state.scratch.length === 1 ? '' : 's'}</p>
    {error && <p role="alert">{error}</p>}
    <p role="status">{compare.error}</p>
    {compare.selection.length >= 2 ? <ComparisonView peers={compare.selection} onClear={compare.clear} renderPeer={(peer, config, nudge) => <>
      <h3>{peer.label}</h3><Fretboard context="harmony" layers={[{ id: peer.id, label: peer.label, focal: true, positions: peer.positions as ResolvedNote[] }]} config={config} onNudge={nudge} onSelect={() => {}} />
    </>} /> : <CompositionView composition={surface.composition} liveTurnId={`${branch.id}:${surface.branch.live_presentation_turn_id ?? 'starter'}`}
      renderBlock={(block, _path, nudge) => {
        if (block.kind === 'fretboard') return <Fretboard context="harmony" layers={[{ id: 'music', label: focusLabel, focal: true, positions: notes }, ...data.note_groups]} config={block.config} onNudge={nudge}
          onSelect={note => { if (busy) return; const index = data.degrees.findIndex(degree => degree.pitch_class === note.pitch_class); if (index >= 0) void edit({ focus: { kind: 'degree', degree: index + 1 } }); }} />;
        if (block.kind === 'chord-palette') return <section aria-label="Chord palette"><h3>Chords in this scale</h3><div className="music-controls">{data.palette.map(item => <div key={item.numeral}>
          <button disabled={busy} className="music-button" aria-label={`Focus ${item.display}`} onClick={() => void edit({ focus: { kind: 'chord', chord: { root: item.root, quality: item.quality } } })}>{block.config?.labels === 'numerals' ? item.numeral : item.display}</button>
          <button disabled={busy} className="music-button" aria-label={`Add ${item.display} to scratch`} onClick={() => void edit({ add_scratch: { root: item.root, quality: item.quality } })}>+</button>
        </div>)}</div>{!data.palette.length && <p>Choose a key with diatonic chords.</p>}</section>;
        if (block.kind === 'degree-map') return <section aria-label="Scale degrees"><h3>Scale degrees</h3><div className="music-controls">{data.degrees.map((degree, index) => <button key={degree.degree} disabled={busy} className="music-button" aria-label={`Degree ${index + 1}`} onClick={() => void edit({ focus: { kind: 'degree', degree: index + 1 } })}>{block.config?.labels === 'notes' ? degree.note : degree.degree}</button>)}</div></section>;
        if (block.kind === 'circle-of-fifths') return <section aria-label="Circle of fifths"><h3>Circle of fifths</h3><div className="music-controls">{surface.catalog.circle_keys.map(key => <button key={key} className="music-button" disabled={busy} aria-label={`Key ${key}`} aria-pressed={key === root} onClick={() => void edit({ tonal_center: { root: key, scale } })}>{key}</button>)}</div></section>;
        if (block.kind === 'explanation') return <Explanation text={String(block.config?.text ?? data.degrees.map(n => n.note).join(' · '))} />;
        return <p>{block.kind.replaceAll('-', ' ')} is coming next.</p>;
      }} />}
    <form onSubmit={event => { event.preventDefault(); void ask(); }} className="mt-4">
      <label htmlFor={`tutor-${branch.id}`}>Ask the Tutor</label>
      <div className="music-controls"><input id={`tutor-${branch.id}`} value={question} onChange={event => setQuestion(event.target.value)} style={{ minWidth: 0, width: 'min(100%, 32rem)' }} /><button className="music-button" disabled={busy || !question.trim()}>Ask</button></div>
    </form>
    {answer && <Explanation text={answer} />}
  </section>;
}
