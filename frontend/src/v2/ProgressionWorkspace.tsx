import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import type { V2Branch } from '../types/v2';
import { CompositionView } from './Composition';
import { Fretboard } from './Fretboard';
import type { ResolvedNote } from './Fretboard';
import { ComparisonView, Explanation, WorkspaceHeader } from './SharedBlocks';
import { ExerciseComposer } from './ExerciseComposer';
import { ChordInspector } from './ChordFocus';
import { HarmonicFunction, VoiceLeading } from './ProgressionAnalysis';
import { ProgressionEditor } from './ProgressionEditor';
import { useCompare } from './compare';
import type { ProgressionSurface } from './progression';

export function ProgressionWorkspace({ branch, onChange }: { branch: V2Branch; onChange: (branch: V2Branch) => void }) {
  const [surface, setSurface] = useState<ProgressionSurface | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [replacing, setReplacing] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const compare = useCompare();
  useEffect(() => {
    let cancelled = false;
    apiClient.getProgressionSurface(branch.session_id, branch.id).then(value => { if (!cancelled) setSurface(value); }).catch(err => { if (!cancelled) setError(String(err)); });
    return () => { cancelled = true; };
  }, [branch.id, branch.session_id]);
  async function edit(value: Record<string, unknown>) {
    setBusy(true); setError('');
    try { const next = await apiClient.editProgression(branch.session_id, branch.id, value); setSurface(next); onChange(next.branch); }
    catch (err) { setError(String(err)); } finally { setBusy(false); }
  }
  async function save() {
    if (!surface) return;
    setBusy(true); setError('');
    try { const result = await apiClient.saveProgressionIdea(surface.branch); onChange(result.branch); setSurface(await apiClient.getProgressionSurface(branch.session_id, branch.id)); setAnswer('Idea saved.'); }
    catch (err) { setError(String(err)); } finally { setBusy(false); }
  }
  async function ask() {
    if (!question.trim()) return;
    setBusy(true); setError('');
    try { const result = await apiClient.sendTutorTurn({ session_id: branch.session_id, branch_id: branch.id, message: question }); setAnswer(result.message); setQuestion(''); const next = await apiClient.getProgressionSurface(branch.session_id, branch.id); setSurface(next); onChange(next.branch); }
    catch (err) { setError(String(err)); } finally { setBusy(false); }
  }
  if (!surface) return <p role="status">{error || 'Loading Progression…'}</p>;
  const workspace = surface.branch.progression_workspace!;
  const idea = workspace.ideas.find(value => value.id === workspace.active_idea_id);
  const data = idea ? surface.resolved[idea.id] : null;
  const focus = workspace.focus;
  const step = data?.steps.find(value => value.id === (focus?.kind === 'step' ? focus.step_id : focus?.from_step_id)) ?? data?.steps[0];
  const next = focus?.kind === 'transition' ? data?.steps.find(value => value.id === focus.to_step_id) : null;
  return <section data-testid="progression-workspace" aria-busy={busy}>
    <WorkspaceHeader title="Progression" focus={focus ? `${focus.kind} ${(data?.steps.findIndex(value => value.id === (focus.kind === 'step' ? focus.step_id : focus.from_step_id)) ?? -1) + 1}` : 'Whole idea'} onBack={focus ? () => void edit({ focus: null }) : undefined}>
      <label>Active idea <select value={workspace.active_idea_id ?? ''} disabled={busy} onChange={event => void edit({ active_idea_id: event.target.value })}>{workspace.ideas.map(value => <option key={value.id} value={value.id}>{value.label}</option>)}</select></label>
      {idea && <><label>Key root <select aria-label="Key root" disabled={busy} value={idea.tonal_center?.root ?? ''} onChange={event => void edit({ tonal_center: event.target.value ? { root: event.target.value, scale: idea.tonal_center?.scale ?? 'major' } : null })}><option value="">No key</option>{surface.catalog.roots.map(root => <option key={root}>{root}</option>)}</select></label><label>Key scale <select aria-label="Key scale" disabled={busy || !idea.tonal_center} value={idea.tonal_center?.scale ?? 'major'} onChange={event => void edit({ tonal_center: { root: idea.tonal_center!.root, scale: event.target.value } })}>{Object.entries(surface.catalog.scales).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Tuning <select disabled={busy} value={idea.tuning[5] === 38 ? 'drop-d' : 'standard'} onChange={event => void edit({ tuning: [64,59,55,50,45,event.target.value === 'drop-d' ? 38 : 40] })}><option value="standard">Standard</option><option value="drop-d">Drop D</option></select></label><button className="music-button" disabled={busy} onClick={() => void save()}>Save idea</button><span>{idea.dirty ? 'Unsaved changes' : 'Saved'}</span></>}
    </WorkspaceHeader>
    {error && <p role="alert">{error}</p>}<p role="status">{compare.error}</p>
    {compare.selection.length >= 2 ? <ComparisonView peers={compare.selection} onClear={compare.clear} renderPeer={(peer, config, nudge) => <><h3>{peer.label}</h3><p>{String(peer.sequence ?? '')}</p><Fretboard context="progression" layers={[{ id: peer.id, label: peer.label, positions: peer.positions as ResolvedNote[], focal: true }]} config={config} onNudge={nudge} onSelect={() => {}} /></>} /> : <CompositionView composition={surface.composition} liveTurnId={`${branch.id}:${surface.branch.live_presentation_turn_id ?? 'starter'}`} renderBlock={(block, _path, nudge) => {
      if (block.kind === 'progression-idea-list') return <section aria-label="Progression ideas"><h3>Ideas</h3>{workspace.ideas.map(value => <div key={value.id} className="music-controls"><button className="music-button" disabled={busy} aria-pressed={value.id === workspace.active_idea_id} onClick={() => void edit({ active_idea_id: value.id })}>{value.label}</button><button className="music-button" onClick={() => compare.toggle({ kind: 'progression-idea', id: value.id, label: value.label, sequence: value.chords.map(step => `${step.root} ${step.quality} (${step.duration_beats} beats)`).join(' → '), positions: surface.resolved[value.id].steps.flatMap(step => step.positions) })}>Compare {value.label}</button></div>)}</section>;
      if (block.kind === 'harmonic-function' && data) return <HarmonicFunction data={data} />;
      if (block.kind === 'voice-leading' && data) return <VoiceLeading data={data} between={block.config?.between} onFocus={(from_step_id, to_step_id) => { if (!busy) void edit({ focus: { kind: 'transition', from_step_id, to_step_id } }); }} />;
      if (block.kind === 'chord-inspector' && step && idea) return <><ChordInspector context="progression" chord={step} notes={step.notes} functionLabel={step.function} hasKey={!!idea.tonal_center} onReplace={() => setReplacing(true)} onExplore={() => { apiClient.exploreSubject(branch.session_id, branch.id, { root: step.root, quality: step.quality }).then(result => onChange(result.branch)).catch(err => setError(String(err))); }} />{replacing && <div className="music-controls"><label>Replacement root <select value={step.root} onChange={event => void edit({ step_id: step.id, chord: { root: event.target.value, quality: step.quality } })}>{surface.catalog.roots.map(root => <option key={root}>{root}</option>)}</select></label><label>Replacement quality <select value={step.quality} onChange={event => void edit({ step_id: step.id, chord: { root: step.root, quality: event.target.value } })}>{surface.catalog.qualities.map(quality => <option key={quality}>{quality}</option>)}</select></label><button className="music-button" onClick={() => setReplacing(false)}>Done replacing</button></div>}</>;
      if (block.kind === 'progression-editor' && idea && data) return <ProgressionEditor idea={idea} data={data} catalog={surface.catalog} focus={focus} busy={busy} edit={edit} beatsPerBar={Number(block.config?.beats_per_bar ?? 4)} />;
      if (block.kind === 'fretboard' && idea && step) return <Fretboard context="progression" layers={[{ id: step.id, label: `${step.root} ${step.quality}`, positions: step.positions, focal: true }, ...(next ? [{ id: next.id, label: `${next.root} ${next.quality}`, positions: next.positions }] : [])]} config={block.config} onNudge={nudge} onSelect={() => { if (!busy) void edit({ focus: { kind: 'step', step_id: step.id } }); }} preview={{ positions: step.positions, tuning: idea.tuning }} />;
      if (block.kind === 'explanation') return <Explanation text={String(block.config?.text ?? '')} />;
      return <p>{idea ? block.kind.replaceAll('-', ' ') : 'Choose an idea'}</p>;
    }} />}
    {idea && <ExerciseComposer key={idea.id} branch={surface.branch} idea={idea} />}
    <form className="mt-4" onSubmit={event => { event.preventDefault(); void ask(); }}><label htmlFor={`progression-tutor-${branch.id}`}>Ask the Tutor</label><div className="music-controls"><input id={`progression-tutor-${branch.id}`} value={question} onChange={event => setQuestion(event.target.value)} style={{ minWidth: 0, width: 'min(100%,32rem)' }} /><button className="music-button" disabled={busy || !question.trim()}>Ask</button></div></form>
    {answer && <Explanation text={answer} />}
  </section>;
}
