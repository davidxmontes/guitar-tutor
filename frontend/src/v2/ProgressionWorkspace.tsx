import { MusicalInteraction } from './MusicalInteractionProvider';
import { intentFields } from './musicalInteraction';
import { PhysicalChordDiagram } from './PhysicalChordDiagram';
import { Hear } from './Fretboard';
import { TutorPanel } from './TutorPanel';
import { useEffect, useMemo, useState } from 'react';
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
import type { ProgressionFocus, ProgressionSurface } from './progression';
import type { Composition } from './Composition';
import { ProgressionPractice } from './ProgressionPractice';
import { usePractice } from './usePractice';

export function ProgressionWorkspace({ branch, onChange }: { branch: V2Branch; onChange: (branch: V2Branch) => void }) {
  const [surface, setSurface] = useState<ProgressionSurface | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [replacing, setReplacing] = useState(false);
  const [answer, setAnswer] = useState('');
  const [view, setView] = useState(branch.live_presentation_turn_id ? 'tutor' : 'fretboard');
  const compare = useCompare();
  const workspace = surface?.branch.progression_workspace;
  const idea = workspace?.ideas.find(value => value.id === workspace.active_idea_id);
  const data = idea && surface ? surface.resolved[idea.id] : null;
  const guide = useMemo(() => data && idea ? data.steps.map(step => ({ label: `${step.root} ${step.quality}`, beats: step.duration_beats, positions: step.positions, tuning: idea.tuning })) : [], [data, idea]);
  const durations = useMemo(() => guide.map(step => step.beats), [guide]);
  const practice = usePractice(durations, 80, guide);
  useEffect(() => {
    let cancelled = false;
    apiClient.getProgressionSurface(branch.session_id, branch.id).then(value => { if (!cancelled) setSurface(value); }).catch(err => { if (!cancelled) setError(String(err)); });
    return () => { cancelled = true; };
  }, [branch.id, branch.session_id]);
  async function edit(value: Record<string, unknown>) {
    if (busy) return;
    practice.exit();
    setBusy(true); setError('');
    const previous = surface;
    if ('focus' in value && surface && workspace) setSurface({ ...surface, branch: { ...surface.branch, progression_workspace: { ...workspace, focus: value.focus as ProgressionFocus | null } } });
    try { const next = await apiClient.editProgression(branch.session_id, branch.id, value); setSurface(next); onChange(next.branch); }
    catch (err) { setSurface(previous); setError(String(err)); } finally { setBusy(false); }
  }
  async function save() {
    if (!surface) return;
    setBusy(true); setError('');
    try { const result = await apiClient.saveProgressionIdea(surface.branch); onChange(result.branch); setSurface(await apiClient.getProgressionSurface(branch.session_id, branch.id)); setAnswer('Idea saved.'); }
    catch (err) { setError(String(err)); } finally { setBusy(false); }
  }
  async function refresh(updated: V2Branch) {
    practice.exit(); onChange(updated); compare.clear(); setView(updated.live_presentation_turn_id ? 'tutor' : 'fretboard');
    setSurface(await apiClient.getProgressionSurface(branch.session_id, branch.id));
  }
  if (!surface || !workspace) return <p role="status">{error || 'Loading Progression…'}</p>;
  const focus = workspace.focus;
  const selectedStep = data?.steps.find(value => value.id === (focus?.kind === 'step' ? focus.step_id : focus?.from_step_id)) ?? data?.steps[0];
  const step = practice.active ? data?.steps[Math.max(0, practice.position.index)] : selectedStep;
  const next = !practice.active && focus?.kind === 'transition' ? data?.steps.find(value => value.id === focus.to_step_id) : null;
  const shownIndex = data?.steps.findIndex(value => value.id === step?.id) ?? -1;
  const composition: Composition = view === 'tutor' ? surface.composition : { pattern: 'stack', focal: 'items', slots: { items: [
    { pattern: 'split', focal: 'items', slots: { items: [
      { kind: view === 'voice-leading' ? 'voice-leading' : view === 'harmonic-function' ? 'harmonic-function' : 'progression-editor', size: 'small' },
      { kind: 'fretboard', size: 'fill' },
    ] } },
    ...(workspace.ideas.length > 1 ? [{ kind: 'progression-idea-list' }] : []),
  ] } };
  const selectStep = (step_id: string) => { if (busy) return; compare.clear(); void edit(intentFields({ type: 'step', step_id })); };
  const inspect = (target: ProgressionFocus) => {
    if (busy) return;
    compare.clear(); const { kind, ...fields } = target; void edit(intentFields({ type: kind, ...fields } as import('./musicalInteraction').MusicalIntent));
    requestAnimationFrame(() => document.getElementById('workspace-music')?.scrollIntoView({ block: 'start' }));
  };
  return <MusicalInteraction scope={JSON.stringify([branch.id, surface.branch.live_presentation_turn_id, idea?.id, focus])} onSelect={intent => { if (!busy) void edit(intentFields(intent)); }}><section className="learning-workspace progression-workspace" data-testid="progression-workspace" aria-busy={busy}>
    <WorkspaceHeader title="Progression" focus={focus ? `${focus.kind} ${(data?.steps.findIndex(value => value.id === (focus.kind === 'step' ? focus.step_id : focus.from_step_id)) ?? -1) + 1}` : 'Whole idea'} onBack={focus ? () => void edit({ focus: null }) : undefined}>
      <label>Active idea <select value={workspace.active_idea_id ?? ''} disabled={busy} onChange={event => void edit({ active_idea_id: event.target.value })}>{workspace.ideas.map(value => <option key={value.id} value={value.id}>{value.label}</option>)}</select></label>
      {idea && <><label>Key root <select aria-label="Key root" disabled={busy} value={idea.tonal_center?.root ?? ''} onChange={event => void edit({ tonal_center: event.target.value ? { root: event.target.value, scale: idea.tonal_center?.scale ?? 'major' } : null })}><option value="">No key</option>{surface.catalog.roots.map(root => <option key={root}>{root}</option>)}</select></label><label>Key scale <select aria-label="Key scale" disabled={busy || !idea.tonal_center} value={idea.tonal_center?.scale ?? 'major'} onChange={event => void edit({ tonal_center: { root: idea.tonal_center!.root, scale: event.target.value } })}>{Object.entries(surface.catalog.scales).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Tuning <select disabled={busy} value={idea.tuning[5] === 38 ? 'drop-d' : 'standard'} onChange={event => void edit({ tuning: [64,59,55,50,45,event.target.value === 'drop-d' ? 38 : 40] })}><option value="standard">Standard</option><option value="drop-d">Drop D</option></select></label><button className="music-button" disabled={busy} onClick={() => void save()}>Save idea</button><span>{idea.dirty ? 'Unsaved changes' : 'Saved'}</span></>}
    </WorkspaceHeader>
    <nav className="learning-view-nav" aria-label="Progression views">{[['fretboard', 'Explore chords'], ['tutor', "Tutor’s view"], ['harmonic-function', 'Harmonic function'], ['voice-leading', 'Voice leading']].map(([value, label]) => <button key={value} className="music-button" disabled={busy} aria-pressed={view === value} onClick={() => { setView(value); compare.clear(); }}>{label}</button>)}<a href="#workspace-tutor">Ask your Tutor ↗</a></nav>
    <div className="learning-workspace-layout"><div className="learning-workspace-main" id="workspace-music" tabIndex={-1}>
    {error && <p role="alert">{error}</p>}<p role="status">{compare.error}</p>
    {idea && data && <ProgressionPractice idea={idea} data={data} selectedId={selectedStep?.id} busy={busy} onSelect={selectStep} edit={edit} practice={{ ...practice, enter: () => { compare.clear(); practice.setAudioMode('both'); practice.enter(); } }} />}
    {compare.selection.length >= 2 ? <ComparisonView peers={compare.selection} onClear={compare.clear} renderPeer={(peer, config, nudge) => <><h3>{peer.label}</h3><p>{String(peer.sequence ?? '')}</p><Fretboard context="progression" layers={[{ id: peer.id, label: peer.label, positions: peer.positions as ResolvedNote[], focal: true }]} config={config} onNudge={nudge} onSelect={() => {}} /></>} /> : <CompositionView composition={composition} liveTurnId={`${branch.id}:${view}:${surface.branch.live_presentation_turn_id ?? 'starter'}`} renderBlock={(block, _path, nudge) => {
      if (block.kind === 'progression-idea-list') return <section aria-label="Progression ideas"><h3>Ideas</h3>{workspace.ideas.map(value => <div key={value.id} className="music-controls"><button className="music-button" disabled={busy} aria-pressed={value.id === workspace.active_idea_id} onClick={() => void edit({ active_idea_id: value.id })}>{value.label}</button><button className="music-button" onClick={() => compare.toggle({ kind: 'progression-idea', id: value.id, label: value.label, sequence: value.chords.map(step => `${step.root} ${step.quality} (${step.duration_beats} beats)`).join(' → '), positions: surface.resolved[value.id].steps.flatMap(step => step.positions) })}>Compare {value.label}</button></div>)}</section>;
      if (block.kind === 'candidate-set') return <p>Audition and keep alternatives in <a href="#workspace-tutor">Your Tutor →</a></p>;
      if (block.kind === 'harmonic-function' && data) return <HarmonicFunction data={data} selectedId={step?.id} busy={busy} onFocus={step_id => inspect({ kind: 'step', step_id })} />;
      if (block.kind === 'voice-leading' && data) return <VoiceLeading data={data} between={block.config?.between} focus={focus} busy={busy} onFocus={(from_step_id, to_step_id) => inspect({ kind: 'transition', from_step_id, to_step_id })} />;
      if (block.kind === 'chord-inspector' && step && idea) return <><ChordInspector context="progression" chord={step} notes={step.notes} functionLabel={step.function} hasKey={!!idea.tonal_center} onReplace={() => setReplacing(true)} onExplore={() => { apiClient.exploreSubject(branch.session_id, branch.id, { root: step.root, quality: step.quality }).then(result => onChange(result.branch)).catch(err => setError(String(err))); }} />{replacing && <div className="music-controls"><label>Replacement root <select value={step.root} onChange={event => void edit({ step_id: step.id, chord: { root: event.target.value, quality: step.quality } })}>{surface.catalog.roots.map(root => <option key={root}>{root}</option>)}</select></label><label>Replacement quality <select value={step.quality} onChange={event => void edit({ step_id: step.id, chord: { root: step.root, quality: event.target.value } })}>{surface.catalog.qualities.map(quality => <option key={quality}>{quality}</option>)}</select></label><button className="music-button" onClick={() => setReplacing(false)}>Done replacing</button></div>}</>;
      if (block.kind === 'chord-diagram' && idea && step) {
        const subject = block.config?.subject ?? block.subject;
        const explicit = subject && typeof subject === 'object' && 'step_id' in subject ? data?.steps.find(step => step.id === subject.step_id) : undefined;
        const target = subject && typeof subject === 'object' ? explicit : (subject === 'next' ? data?.steps[shownIndex + 1] : subject === 'previous' ? data?.steps[shownIndex - 1] : step);
        return <section aria-label="Selected chord diagram">{(subject == null || subject === 'focus' ? [step, ...(next ? [next] : [])] : target ? [target] : []).map(chord => <div key={chord.id}><h3>{chord.root} {chord.quality}</h3><PhysicalChordDiagram positions={chord.positions} tuning={idea.tuning} label={`${chord.root} ${chord.quality}`} selected={selectedStep?.id === chord.id} disabled={busy} onSelect={() => selectStep(chord.id)} /><Hear voicing={{ positions: chord.positions, tuning: idea.tuning }} /></div>)}</section>;
      }
      if (block.kind === 'progression-editor'  && idea && data) return <ProgressionEditor idea={idea} data={data} catalog={surface.catalog} focus={practice.active && step ? { kind: 'step', step_id: step.id } : focus} busy={busy || practice.active} edit={edit} beatsPerBar={Number(block.config?.beats_per_bar ?? 4)} />;
      if (block.kind === 'fretboard' && idea && step) return <section className="progression-linked-fretboard" aria-label="Selected chord on the fretboard"><div className="progression-focus-heading"><div><span className="learning-eyebrow">{practice.active ? 'Following playback' : `Chord ${shownIndex + 1} of ${data!.steps.length}`}</span><h3>{step.root} {step.quality}{next && ` → ${next.root} ${next.quality}`}</h3></div><nav aria-label="Step through chords"><button className="music-button" disabled={busy || shownIndex <= 0} onClick={() => selectStep(data!.steps[shownIndex - 1].id)}>← Previous</button><button className="music-button" disabled={busy || shownIndex >= data!.steps.length - 1} onClick={() => selectStep(data!.steps[shownIndex + 1].id)}>Next →</button></nav></div><Fretboard compactControls context="progression" layers={[{ id: step.id, label: `${step.root} ${step.quality}`, positions: step.positions, focal: true }, ...(next ? [{ id: next.id, label: `${next.root} ${next.quality}`, positions: next.positions }] : [])]} config={block.config} onNudge={nudge} onSelect={(_note, layer) => { if (!busy) selectStep(layer.id); }} preview={{ positions: step.positions, tuning: idea.tuning }} /></section>;
      if (block.kind === 'explanation') return <Explanation text={String(block.config?.text ?? '')} />;
      return <p>{idea ? block.kind.replaceAll('-', ' ') : 'Choose an idea'}</p>;
    }} />}
    {idea && <ExerciseComposer key={idea.id} branch={surface.branch} idea={idea} />}
    {answer && <p className="learning-notice" role="status">{answer}</p>}
    </div><TutorPanel branch={surface.branch} context={idea ? `${idea.label}${selectedStep ? ` · ${selectedStep.root} ${selectedStep.quality}` : ''}` : 'Progression'} busy={busy} onBusy={value => { if (value) practice.exit(); setBusy(value); }} onRefresh={refresh} />
    </div>
  </section></MusicalInteraction>;
}
