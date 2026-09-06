import { ExerciseComposer } from './ExerciseComposer';
import { PhysicalWorkspaceControls } from './PhysicalWorkspaceControls';
import { BLOCK_ACCEPTS } from './workspaceAdapter';
import { TutorChat } from './TutorChat';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '../api/client';
import type { TutorFocus, WorkspaceTurnResult, V2Branch, ExerciseStep } from '../types/v2';
import type { ChordEntity, ConceptWorkspace, Resolved, ResolvedEntity, ScaleMode, TypedInspection, WorkspaceBlock, ProgressionAction, WorkspacePosition } from '../types/conceptWorkspace';
import { playNoteSequence, playChordSequence } from '../utils/audio';
import { ConceptWorkspaceBlock } from './ConceptWorkspaceBlocks';

const field = 'ct-field';
const control = 'ct-field ct-btn';
const controlSm = 'ct-field ct-btn';
const primary = 'ct-field ct-btn ct-btn-primary';
const roots = ['C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const modes: ScaleMode[] = ['major', 'natural_minor', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'locrian', 'harmonic_minor', 'melodic_minor', 'pentatonic_major', 'pentatonic_minor', 'blues'];
const names: Record<WorkspaceBlock['kind'], string> = { fretboard: 'Fretboard', degree_strip: 'Degree strip', chord_diagrams: 'Chord diagrams', circle: 'Circle', progression: 'Progression' };

// A one-octave ascending run, reconstructed from the resolved core (T1 dropped `playback`).
function scaleRun(entity: ResolvedEntity | undefined, tuning: number[]): WorkspacePosition[] {
  if (!entity) return [];
  const low = Math.min(...tuning);
  const tonic = low + (((entity.notes[0].pitch_class - low) % 12) + 12) % 12;
  return [...entity.notes.map((note) => note.offset), 12]
    .map((offset) => entity.positions.filter((p) => p.midi === tonic + offset).sort((a, b) => a.fret - b.fret || b.string - a.string)[0])
    .filter(Boolean);
}

export function ConceptWorkspacePanel({ sessionId, branch, onBranchChange, onPendingChange }: { sessionId: string; branch: V2Branch; onBranchChange: (branch: V2Branch) => void; onPendingChange: (pending: boolean) => void }) {
  const [workspace, setWorkspace] = useState(branch.working_draft!);
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [tutorBusy, setTutorBusy] = useState(false);
  const [tutorFocus, setTutorFocus] = useState<TutorFocus | null>(null);
  const [preview, setPreview] = useState<{ messageId: string; snapshot: ConceptWorkspace; facts: Resolved; focus: TutorFocus | null } | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [inspection, setInspection] = useState<TypedInspection | null>(null);
  const [studyName, setStudyName] = useState(workspace.title);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('Loading workspace…');
  const [busy, setBusy] = useState(true);
  const [adding, setAdding] = useState(false);
  const [sourceId, setSourceId] = useState(workspace.relations[0]?.id ?? workspace.entities[0].id);
  const [viewKind, setViewKind] = useState<WorkspaceBlock['kind']>('fretboard');
  const [playing, setPlaying] = useState(false);
  const [transposeDistance, setTransposeDistance] = useState(2);
  const [tutorOpen, setTutorOpen] = useState(true);
  const tutorToggled = useRef(false);
  const closeTutor = useCallback(() => { tutorToggled.current = true; setTutorOpen(false); }, []);
  const openTutor = useCallback(() => { tutorToggled.current = true; setTutorOpen(true); }, []);
  const saved = useRef(workspace);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopAudio = useRef<(() => void) | null>(null);
  const playbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tutorButton = useRef<HTMLButtonElement>(null);
  const tutorCloseButton = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const previewHeading = useRef<HTMLHeadingElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);

  useEffect(() => { (preview ? previewHeading : heading).current?.focus(); }, [preview]);

  useEffect(() => {
    if (!tutorToggled.current) return;
    (tutorOpen ? tutorCloseButton : tutorButton).current?.focus();
  }, [tutorOpen]);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const sync = () => { if (!tutorToggled.current) setTutorOpen(mq.matches); };
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    let live = true;
    apiClient.resolveConceptWorkspace(saved.current).then(value => { if (live) { setResolved(value); setStatus('Draft autosaved'); setBusy(false); heading.current?.focus(); } })
      .catch(() => { if (live) { setError('Could not load this workspace. Reload to try again.'); setBusy(false); } });
    return () => { live = false; stopAudio.current?.(); if (playbackTimer.current) clearTimeout(playbackTimer.current); };
  }, []);

  useEffect(() => {
    if (workspace === saved.current) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [workspace]);

  const stop = () => { stopAudio.current?.(); stopAudio.current = null; if (playbackTimer.current) clearTimeout(playbackTimer.current); setPlaying(false); };
  const persist = useCallback(async (next: ConceptWorkspace) => {
    setBusy(true); setStatus('Saving draft…');
    try {
      const updated = await apiClient.saveConceptWorkspace(sessionId, branch.id, next);
      saved.current = updated.working_draft!;
      setWorkspace(saved.current); onBranchChange(updated); setStatus('Draft autosaved'); setError(null); onPendingChange(false);
    } catch (err) { setStatus('Draft not saved'); setError(`${String(err)}. Your edits are still here. Retry, or download your draft before reloading if it changed elsewhere.`); }
    finally { setBusy(false); }
  }, [sessionId, branch.id, onBranchChange, onPendingChange]);

  useEffect(() => {
    if (workspace === saved.current) return;
    autosaveTimer.current = setTimeout(() => { void persist(workspace); }, 250);
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current); };
  }, [workspace, persist]);

  const change = async (next: ConceptWorkspace) => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    stop(); setBusy(true); onPendingChange(true); setError(null); setStatus('Updating views…');
    try {
      const facts = await apiClient.resolveConceptWorkspace(next);
      setWorkspace(next); setResolved(facts); setInspection(null);
      setStatus('Draft changed…'); setBusy(false); return true;
    } catch { setError('That combination is not supported. Your previous draft is unchanged.'); setStatus('Change not applied'); setBusy(false); onPendingChange(workspace !== saved.current); return false; }
  };
  const progressionAction = async (blockId: string, action: ProgressionAction) => {
    stop(); setBusy(true); onPendingChange(true); setError(null); setStatus('Updating progression…');
    try {
      const next = await apiClient.transformWorkspaceProgression(workspace, blockId, action);
      if (await change(next)) {
        setSourceId(next.blocks.find(b => b.id === blockId)!.sources[0]);
        if (action.step !== undefined) setInspection({ kind: 'step', block_id: blockId, index: action.step });
      }
    } catch (error) { setError(`${String(error)}. Your draft is unchanged. Choose another edit or transpose distance.`); setStatus('Change not applied'); setBusy(false); onPendingChange(false); }
  };
  const hearClips = (clips: { positions: { string: number; fret: number }[]; tuning: number[] }[]) => {
    stop(); setError(null);
    try { stopAudio.current = playChordSequence(clips); setPlaying(true); playbackTimer.current = setTimeout(() => { setPlaying(false); stopAudio.current = null; }, clips.length * 1200 + 200); }
    catch { setError('Audio could not start. Your draft is unchanged.'); }
  };
  const keepCaged = async (chordId: string, shape: string) => {
    stop(); setBusy(true); onPendingChange(true); setError(null); setStatus('Keeping voicing…');
    try { await change(await apiClient.materializeCagedRegion(workspace, chordId, shape)); }
    catch { setError('Could not keep this voicing. Your draft is unchanged.'); setStatus('Change not applied'); setBusy(false); onPendingChange(workspace !== saved.current); }
  };
  const receiveTutorResult = async (result: WorkspaceTurnResult) => {
    stop();
    const next = result.branch.working_draft!;
    saved.current = next; setWorkspace(next); setResolved(null); setInspection(null);
    setSourceId(next.relations[0]?.id ?? next.entities[0].id);
    onBranchChange(result.branch); setStatus('Draft autosaved'); setError(null);
    try { setResolved(await apiClient.resolveConceptWorkspace(next)); }
    catch { setError('Your Tutor change is saved, but its views could not load. Reload to try again.'); }
  };
  const saveStudy = async (asNew = false) => {
    setBusy(true); onPendingChange(true); setSaveError(null); setSaveMessage(null);
    try {
      const updated = await apiClient.saveWorkspaceStudy(sessionId, branch.id, workspace.version, studyName.trim(), asNew);
      saved.current = updated.working_draft!; setWorkspace(saved.current); setStudyName(saved.current.title);
      onBranchChange(updated); setStatus('Draft autosaved'); setSaveMessage(asNew ? 'Saved as a new study in My Stuff.' : 'Study saved in My Stuff.');
    } catch (error) { setSaveError(`${String(error)} Your draft is still here. Retry Save, or save it as a new study. Reload this branch to check an interrupted save; open the latest saved version from My Stuff to compare.`); }
    finally { setBusy(false); onPendingChange(false); }
  };
  const previewTurn = async (messageId: string, snapshot: ConceptWorkspace, focus: TutorFocus | null) => {
    stop(); setBusy(true); onPendingChange(true); setError(null);
    try { const facts = await apiClient.resolveConceptWorkspace(snapshot); setPreviewError(null); setPreview({ messageId, snapshot, facts, focus }); }
    catch { setError('Could not preview that turn. Your current draft is unchanged. Try Preview again.'); }
    finally { setBusy(false); onPendingChange(false); }
  };
  const restorePreview = async () => {
    if (!preview) return;
    setBusy(true); onPendingChange(true); setPreviewError(null);
    try {
      const result = await apiClient.restoreWorkspaceSnapshot(sessionId, branch.id, preview.messageId, workspace.version);
      await receiveTutorResult(result); setStudyName(result.branch.working_draft!.title); setSaveMessage(null);
      setTutorFocus(preview.focus); setHistoryVersion(value => value + 1); setPreview(null); setStatus('Earlier state restored as current draft');
    } catch (error) { setPreviewError(`${String(error)} No restore was confirmed. Return to current to check your draft before trying again.`); }
    finally { setBusy(false); onPendingChange(false); }
  };
  const locked = busy || tutorBusy;
  const updateSettings = (block: WorkspaceBlock, patch: Partial<WorkspaceBlock['settings']>) => change({ ...workspace, blocks: workspace.blocks.map(item => item.id === block.id ? { ...item, settings: { ...item.settings, ...patch } } : item) });
  const editScale = (id: string | null, patch: { root?: string; mode?: ScaleMode }) => change({ ...workspace, entities: workspace.entities.map(entity => entity.kind === 'scale' && (!id || entity.id === id) ? { ...entity, ...patch } : entity) });
  const removeScale = (id: string) => {
    const relations = workspace.relations.filter(relation => !relation.entity_ids.includes(id));
    const sources = new Set([...workspace.entities.filter(entity => entity.id !== id), ...relations].map(item => item.id));
    const blocks = workspace.blocks.filter(block => block.sources.every(source => sources.has(source)));
    change({ ...workspace, entities: workspace.entities.filter(entity => entity.id !== id), relations, blocks,
      composition: workspace.composition.map(row => ({ items: row.items.filter(item => blocks.some(block => block.id === item.block_id)) })).filter(row => row.items.length) });
    setSourceId(relations[0]?.id ?? workspace.entities.find(entity => entity.id !== id)!.id);
  };
  const relation = workspace.relations[0];
  const relationResolved = relation && resolved ? resolved.relations[relation.id] ?? null : null;
  const transition = relationResolved?.kind === 'transition' ? relationResolved : null;
  const summary = relationResolved?.kind === 'compare' ? relationResolved : null;
  const scales = workspace.entities.filter(e => e.kind === 'scale');
  const progressionBlock = workspace.blocks.find(b => b.kind === 'progression') ?? null;
  const progression = progressionBlock && resolved && resolved.entities[progressionBlock.sources[0]]?.kind === 'progression'
    ? resolved.entities[progressionBlock.sources[0]] as Extract<ResolvedEntity, { kind: 'progression' }> : null;
  const progressionKey = progression && resolved && resolved.entities[progression.key_id]?.kind === 'key'
    ? resolved.entities[progression.key_id] as Extract<ResolvedEntity, { kind: 'key' }> : null;
  const selectedStep = progression && inspection?.kind === 'step' && inspection.block_id === progressionBlock?.id ? inspection.index : 0;
  const selectedChord = progression ? progression.steps[selectedStep] ?? progression.steps[0] : null;
  const cagedBlock = workspace.blocks.find(b => b.settings.mode === 'caged') ?? null;
  const cagedChord = cagedBlock ? workspace.entities.find((e): e is ChordEntity => e.id === cagedBlock.sources[0] && e.kind === 'chord') ?? null : null;
  const cagedRegions = cagedChord && resolved && resolved.entities[cagedChord.id]?.kind === 'chord'
    ? (resolved.entities[cagedChord.id] as Extract<ResolvedEntity, { kind: 'chord' }>).cagedRegions ?? null : null;
  const physical = !progression && workspace.entities.some(e => e.kind === 'voicing');
  const placements = workspace.composition.flatMap((row, rowIndex) => row.items.map(item => ({ ...item, row: rowIndex })));
  const source = [...workspace.entities, ...workspace.relations].find(item => item.id === sourceId);
  const sourceKind = source?.kind;
  const allowedViews = sourceKind ? (Object.keys(BLOCK_ACCEPTS) as WorkspaceBlock['kind'][])
    .filter(kind => kind in names && (BLOCK_ACCEPTS[kind] as readonly string[]).includes(sourceKind)
      && (kind !== 'chord_diagrams' || (source?.kind === 'chord' && ['major', 'minor'].includes((source as ChordEntity).quality)))) : [];

  const compareLabels = relation?.kind === 'compare' && resolved ? relation.entity_ids.map(id => resolved.entities[id]?.label ?? '') : null;
  const title = compareLabels ? compareLabels.join(' vs ') : workspace.title;
  const previewCompare = preview?.snapshot.relations[0];
  const previewTitle = previewCompare?.kind === 'compare' ? previewCompare.entity_ids.map(id => preview!.facts.entities[id]?.label ?? '').join(' vs ') : preview?.snapshot.title;

  const inspectionLabel = (() => {
    if (!inspection || !resolved) return '';
    if (inspection.kind === 'step') return `chord ${inspection.index + 1}`;
    if (inspection.kind === 'region' || inspection.kind === 'region_note' || inspection.kind === 'region_pair') return String(inspection.key).replace(':', ' → ') + ' shape';
    if ('entity_id' in inspection) return resolved.entities[inspection.entity_id]?.label ?? 'chord';
    if (inspection.kind === 'chord') return `${inspection.root} ${inspection.quality}`;
    if (inspection.kind !== 'pitch') return 'note';
    const pc = inspection.pitch_class;
    for (const entity of Object.values(resolved.entities)) {
      const hit = entity.positions.find(p => p.pitch_class === pc) ?? entity.notes.find(n => n.pitch_class === pc);
      if (hit) return hit.note;
    }
    return 'note';
  })();

  const hearComparison = () => {
    if (playing) { stop(); return; }
    setError(null);
    try {
      if (cagedRegions) { hearClips(cagedRegions.map(region => ({ positions: region.positions, tuning: workspace.tuning }))); return; }
      if (progression) { hearClips(progression.steps); return; }
      if (physical) {
        const ids = relationResolved?.kind === 'transition' ? relationResolved.entity_ids : workspace.entities.filter(e => e.kind === 'voicing').map(e => e.id);
        const clips = ids.map(id => resolved!.entities[id]).filter(Boolean);
        stopAudio.current = playChordSequence(clips); setPlaying(true);
        playbackTimer.current = setTimeout(() => { setPlaying(false); stopAudio.current = null; }, ids.length * 1200 + 200);
        return;
      }
      const ids = relation?.entity_ids ?? scales.map(e => e.id);
      const notes = ids.flatMap(id => scaleRun(resolved!.entities[id], workspace.tuning));
      stopAudio.current = playNoteSequence(notes, workspace.tuning); setPlaying(true);
      playbackTimer.current = setTimeout(() => { setPlaying(false); stopAudio.current = null; }, notes.length * 300 + 400);
    } catch { setError('Audio could not start. Try Hear again. Your draft is unchanged.'); }
  };

  const exerciseSteps: ExerciseStep[] = resolved ? [
    ...scales.flatMap(scaleEntity => scaleRun(resolved.entities[scaleEntity.id], workspace.tuning).map(p => ({ label: `${p.note} · ${p.degree}`, beats: 1, positions: [{ string: p.string, fret: p.fret }], tuning: workspace.tuning }))),
    ...(cagedRegions ? cagedRegions.map(region => ({ label: region.label, positions: region.positions.map(p => ({ string: p.string, fret: p.fret })), tuning: workspace.tuning }))
      : progression ? progression.steps.map(step => ({ label: `${step.root} ${step.quality}`, positions: step.positions.map(p => ({ string: p.string, fret: p.fret })), tuning: step.tuning }))
      : workspace.entities.filter(e => e.kind === 'voicing').map(e => resolved.entities[e.id]).filter(Boolean).map(e => ({ label: e.label, positions: e.positions.map(p => ({ string: p.string, fret: p.fret })), tuning: e.tuning }))
    ).map(clip => ({ ...clip, beats: 4 })),
  ] : [];

  return <>{preview && <section className="min-w-0 space-y-5" aria-label="Turn snapshot preview">
    <header className="space-y-3">
      <p role="status" className="font-semibold">Preview · earlier Tutor turn · read only</p>
      <h2 ref={previewHeading} tabIndex={-1} className="text-2xl font-bold">{previewTitle}</h2>
      <p>Your current draft is unchanged. Restore copies this entire snapshot into a new current draft; conversation and saved studies stay intact.</p>
      <div className="flex flex-wrap gap-3"><button className={control} disabled={busy} onClick={() => setPreview(null)}>Return to current</button>
        <button className={control} disabled={busy} onClick={restorePreview}>Restore this state</button></div>
      {previewError && <p role="alert">{previewError}</p>}
    </header>
    <div className="cw-composition">{preview.snapshot.composition.flatMap((row, index) => row.items.map(item => {
      const block = preview.snapshot.blocks.find(block => block.id === item.block_id)!;
      return <section key={block.id} aria-label={names[block.kind]} className="cw-block min-w-0 space-y-3 rounded-xl border border-[var(--border-primary)] bg-[var(--card-bg)] p-3 sm:p-4" style={{ '--cw-span': item.span, '--cw-row': index + 1, '--cw-order': item.priority === 'primary' ? 0 : item.priority === 'supporting' ? 1 : 2 } as React.CSSProperties}>
        <h3 className="font-bold">{names[block.kind]}</h3>
        <ConceptWorkspaceBlock readOnly block={block} workspace={preview.snapshot} resolved={preview.facts} inspection={null} onInspect={() => {}} tutorFocus={preview.focus} />
      </section>;
    }))}</div>
  </section>}

  <div hidden={Boolean(preview)} className="space-y-4">
    <header className="space-y-2 pb-1">
      <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--accent-700)]">Explore · working draft</p>
      <h2 ref={heading} tabIndex={-1} className="text-xl font-bold">{title}</h2>
      {transition && <p className="text-sm text-[var(--text-secondary)]">{transition.explanation}</p>}
      {summary && <p className="text-sm text-[var(--text-secondary)]">{summary.shared.length} notes stay the same. {summary.removed.length > 0 && `Only in the first scale: ${summary.removed.map(n => n.note).join(', ')}. `}{summary.added.length > 0 && `Only in the second: ${summary.added.map(n => n.note).join(', ')}. `}{summary.removed.length === 0 && summary.added.length === 0 && 'These scales use the same pitches. '} Hear both scales, then select a changed note to find it on the guitar.</p>}
      <div className="flex flex-wrap items-center gap-2"><button type="button" className={primary} disabled={!resolved || locked || Boolean(progression?.steps.some(s => !s.positions.length))} onClick={hearComparison}>{playing ? 'Stop playback' : cagedRegions ? 'Hear adjacent regions' : progression ? 'Hear progression' : physical ? 'Hear D to G' : 'Hear comparison'}</button>
      <button ref={tutorButton} hidden={tutorOpen} className={controlSm} onClick={openTutor}>Open Tutor</button>
      <p role="status" className="text-sm text-[var(--text-secondary)]">{status}</p></div>
      <form className="flex flex-wrap items-center gap-2" onSubmit={event => { event.preventDefault(); void saveStudy(); }}>
        <label className="flex min-w-0 items-center gap-1.5 text-sm">Study name<input required maxLength={120} value={studyName} disabled={locked}
          onChange={event => setStudyName(event.target.value)} className={`${field} min-w-0`} /></label>
        <button className={primary} disabled={locked || workspace !== saved.current || !studyName.trim()}>{branch.current_artifact_id ? 'Save version' : 'Save as study'}</button>
        {branch.current_artifact_id && <button type="button" className={control} disabled={locked || workspace !== saved.current || !studyName.trim()} onClick={() => saveStudy(true)}>Save as a new study</button>}
        {saveMessage && <p role="status" className="text-sm text-[var(--accent-700)]">{saveMessage}</p>}
      </form>
    </header>
    {saveError && <p role="alert">{saveError}</p>}
    {error && <div role="alert" className="space-y-2"><p>{error}</p>{!resolved && !busy && <button className={control} onClick={() => window.location.reload()}>Reload workspace</button>}{workspace !== saved.current && <div className="flex flex-wrap gap-2"><button className={control} disabled={locked} onClick={() => persist(workspace)}>Retry autosave</button><button className={control} onClick={() => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(workspace, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'concept-workspace.json'; link.click(); URL.revokeObjectURL(url); onPendingChange(false);
    }}>Download draft</button></div>}</div>}
    {(scales.length > 0 || physical || (progression && progressionBlock) || cagedChord) && <div className="z-20 -mx-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-[var(--border-primary)] bg-[var(--bg-secondary)] px-4 py-2 text-sm sm:-mx-6 sm:px-6 lg:sticky lg:top-0">
      <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-secondary)]">Music</span>
      {physical && <PhysicalWorkspaceControls workspace={workspace} disabled={locked} onChange={change} />}
      {progression && progressionBlock && progressionKey && <fieldset disabled={locked} className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label className="flex items-center gap-1.5">Key<select aria-label="Progression key" className={`${field} w-16`} value={progressionKey.notes[0].note} onChange={e => change({ ...workspace, entities: workspace.entities.map(en => en.id === progression.key_id && en.kind === 'key' ? { ...en, root: e.target.value } : en) })}>{[...new Set([...roots, progressionKey.notes[0].note])].map(r => <option key={r}>{r}</option>)}</select></label>
        {progression.derived
          ? <button type="button" className={controlSm} onClick={() => progressionAction(progressionBlock.id, { action: 'materialize' })}>Work with these chords</button>
          : <><label className="flex items-center gap-1.5">Transpose<select aria-label="Transpose distance" className={`${field} w-32`} value={transposeDistance} onChange={e => setTransposeDistance(Number(e.target.value))}>{Array.from({ length: 25 }, (_, i) => i - 12).filter(n => n !== 0).map(n => <option key={n} value={n}>{n > 0 ? '+' : ''}{n} semitones</option>)}</select></label>
            <button type="button" className={controlSm} onClick={() => progressionAction(progressionBlock.id, { action: 'transpose', semitones: transposeDistance })}>Transpose progression</button></>}
        {selectedChord && <><span className="ml-1 border-l border-[var(--border-primary)] pl-3 font-semibold text-[var(--text-secondary)]">Chord {selectedStep + 1}</span>
          <select aria-label="Selected chord root" className={`${field} w-16`} value={selectedChord.root} onChange={e => progressionAction(progressionBlock.id, { action: 'edit', step: selectedStep, root: e.target.value })}>{[...new Set([...roots, selectedChord.root])].map(r => <option key={r}>{r}</option>)}</select>
          <select aria-label="Selected chord quality" className={`${field} w-24`} value={selectedChord.quality} onChange={e => progressionAction(progressionBlock.id, { action: 'edit', step: selectedStep, quality: e.target.value as 'major' | 'minor' })}><option value="major">Major</option><option value="minor">Minor</option>{!['major', 'minor'].includes(selectedChord.quality) && <option value={selectedChord.quality}>{selectedChord.quality}</option>}</select>
          <details><summary className="cursor-pointer text-[var(--text-secondary)]">Edit this occurrence’s frets</summary><div className="mt-1 flex flex-wrap gap-2">{Array.from({ length: 6 }, (_, i) => i + 1).map(string => <label key={string} className="text-sm">String {string}<select aria-label={`Selected voicing string ${string}`} className={`${field} mt-0.5 block`} value={selectedChord.positions.find(p => p.string === string)?.fret ?? 'muted'} onChange={e => progressionAction(progressionBlock.id, { action: 'edit', step: selectedStep, positions: [...selectedChord.positions.filter(p => p.string !== string).map(p => ({ string: p.string, fret: p.fret })), ...(e.target.value === 'muted' ? [] : [{ string, fret: Number(e.target.value) }])].sort((a, b) => a.string - b.string) })}><option value="muted">Muted</option>{Array.from({ length: 25 }, (_, i) => <option key={i} value={i}>{i === 0 ? 'Open' : i}</option>)}</select></label>)}</div></details>
          <button type="button" className={controlSm} disabled={selectedStep >= progression.steps.length - 1 || progression.steps.slice(selectedStep, selectedStep + 2).some(s => !s.positions.length)} onClick={() => hearClips(progression.steps.slice(selectedStep, selectedStep + 2))}>Hear selected transition</button></>}
      </fieldset>}
      {cagedChord && <fieldset disabled={locked} className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label className="flex items-center gap-1.5">Root<select aria-label="CAGED root" className={`${field} w-16`} value={cagedChord.root} onChange={e => change({ ...workspace, entities: workspace.entities.map(it => it.id === cagedChord.id ? { ...cagedChord, root: e.target.value } : it) })}>{['C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'].map(r => <option key={r}>{r}</option>)}</select></label>
        <label className="flex items-center gap-1.5">Quality<select aria-label="CAGED quality" className={`${field} w-24`} value={cagedChord.quality} onChange={e => change({ ...workspace, entities: workspace.entities.map(it => it.id === cagedChord.id ? { ...cagedChord, quality: e.target.value } : it) })}><option value="major">Major</option><option value="minor">Minor</option></select></label>
        <label className="flex items-center gap-1.5">Tuning<select aria-label="CAGED tuning" className={`${field} w-32`} value={JSON.stringify(workspace.tuning)} onChange={e => change({ ...workspace, tuning: JSON.parse(e.target.value) })}><option value="[64,59,55,50,45,40]">Standard</option><option value="[64,59,55,50,45,38]">Drop D</option>{!['[64,59,55,50,45,40]', '[64,59,55,50,45,38]'].includes(JSON.stringify(workspace.tuning)) && <option value={JSON.stringify(workspace.tuning)}>Custom</option>}</select></label>
      </fieldset>}
      {scales.length > 0 && <fieldset disabled={locked} className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-1.5">Both roots<select aria-label="Both roots" className={`${field} w-20`} value={scales.every(e => e.root === scales[0].root) ? scales[0].root : ''} onChange={e => editScale(null, { root: e.target.value })}><option value="" disabled>Mixed</option>{roots.map(root => <option key={root}>{root}</option>)}</select></label>
        {scales.map((entity, index) => <div key={entity.id} className="flex items-center gap-1.5">
          <span className="font-semibold text-[var(--text-secondary)]">Scale {index + 1}</span>
          <select aria-label={`Scale ${index + 1} root`} className={`${field} w-16`} value={entity.root} onChange={e => editScale(entity.id, { root: e.target.value })}>{roots.map(root => <option key={root}>{root}</option>)}</select>
          <select aria-label={`Scale ${index + 1} mode`} className={`${field} w-36`} value={entity.mode} onChange={e => editScale(entity.id, { mode: e.target.value as ScaleMode })}>{modes.map(mode => <option key={mode} value={mode}>{mode.replaceAll('_', ' ')}</option>)}</select>
          {workspace.entities.length > 1 && <button aria-label={`Remove scale ${index + 1}`} className={`${controlSm} px-2`} onClick={() => removeScale(entity.id)}>✕</button>}
        </div>)}
        <label className="flex items-center gap-1.5">Tuning<select aria-label="Tuning" className={`${field} w-32`} value={JSON.stringify(workspace.tuning)} onChange={e => change({ ...workspace, tuning: JSON.parse(e.target.value) })}><option value="[64,59,55,50,45,40]">Standard</option><option value="[64,59,55,50,45,38]">Drop D</option>{!['[64,59,55,50,45,40]', '[64,59,55,50,45,38]'].includes(JSON.stringify(workspace.tuning)) && <option value={JSON.stringify(workspace.tuning)}>Custom</option>}</select></label>
      </fieldset>}
    </div>}
    <div className="lg:flex lg:items-start lg:gap-4">
     <div className="min-w-0 space-y-5 lg:flex-1">
    <div className="flex min-h-9 flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]" role="status">{inspection ? <><button className={controlSm} onClick={() => { setInspection(null); heading.current?.focus(); }}>Back</button><span>Inspecting {inspectionLabel} across compatible views</span></> : <span>{progression ? 'Select a chord to edit it or hear its next transition.' : 'Select a note to inspect it across views.'}</span>}</div>
    <div className="cw-composition">{placements.map(placement => {
      const block = workspace.blocks.find(item => item.id === placement.block_id)!;
      const rangeValue = block.settings.fret_start == null || block.settings.fret_end == null ? 'auto' : `${block.settings.fret_start}-${block.settings.fret_end}`;
      return <section key={block.id} aria-label={names[block.kind]} className="cw-block min-w-0 space-y-2 rounded-xl border border-[var(--border-primary)] bg-[var(--card-bg)] p-3" style={{ '--cw-span': placement.span, '--cw-row': placement.row + 1, '--cw-order': placement.priority === 'primary' ? 0 : placement.priority === 'supporting' ? 1 : 2 } as React.CSSProperties}>
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-primary)] pb-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <h3 className="font-bold">{names[block.kind]}</h3>
            <fieldset disabled={locked} className="flex flex-wrap items-center gap-2"><label className="flex items-center gap-1.5">Labels<select className={`${field} w-24`} value={block.settings.labels} onChange={e => updateSettings(block, { labels: e.target.value as 'notes' | 'intervals' })}><option value="notes">Notes</option><option value="intervals">Intervals</option></select></label>
              {block.kind === 'fretboard' && block.settings.mode !== 'caged' && <label className="flex items-center gap-1.5">Frets<select className={`${field} w-20`} value={rangeValue} onChange={e => { if (e.target.value === 'auto') { updateSettings(block, { fret_start: null, fret_end: null }); return; } const [fret_start, fret_end] = e.target.value.split('-').map(Number); updateSettings(block, { fret_start, fret_end }); }}>{[...new Set([rangeValue, 'auto', '0-5', '3-8', '5-10', '7-12', '0-19'])].map(range => <option key={range}>{range}</option>)}</select></label>}
              {(workspace.relations.some(r => r.id === block.sources[0]) || block.settings.mode === 'caged') && <label className="flex items-center gap-1.5"><input type="checkbox" checked={Boolean(block.settings.shared_only)} onChange={e => updateSettings(block, { shared_only: e.target.checked })} />{block.settings.mode === 'caged' ? 'Shared positions only' : 'Shared notes only'}</label>}
            </fieldset>
          </div>
          <button className={controlSm} disabled={locked} onClick={() => { change({ ...workspace, blocks: workspace.blocks.filter(item => item.id !== block.id), composition: workspace.composition.map(row => ({ items: row.items.filter(item => item.block_id !== block.id) })).filter(row => row.items.length) }); addButton.current?.focus(); }}>Remove View</button>
        </header>
        {resolved && <ConceptWorkspaceBlock block={block} workspace={workspace} resolved={resolved} inspection={inspection} onInspect={setInspection} tutorFocus={tutorFocus} disabled={locked} onMaterializeRegion={shape => keepCaged(block.sources[0], shape)} />}
      </section>;
    })}</div>
    <button ref={addButton} className={controlSm} disabled={locked || workspace.blocks.length >= 12} aria-expanded={adding} onClick={() => setAdding(!adding)}>Add View</button>
    {adding && <fieldset disabled={locked} className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border-primary)] p-3 text-sm"><legend className="px-1 text-[var(--text-secondary)]">Add a compatible view</legend>
      <label className="flex items-center gap-1.5">Musical source<select className={`${field} max-w-[12rem]`} value={sourceId} onChange={e => setSourceId(e.target.value)}>{[...workspace.relations, ...workspace.entities].map(item => <option key={item.id} value={item.id}>{resolved ? resolved.entities[item.id]?.label ?? item.kind : item.kind}</option>)}</select></label>
      <label className="flex items-center gap-1.5">View type<select className={`${field} w-36`} value={allowedViews.includes(viewKind) ? viewKind : allowedViews[0] ?? ''} onChange={e => setViewKind(e.target.value as WorkspaceBlock['kind'])}>{allowedViews.map(kind => <option key={kind} value={kind}>{names[kind]}</option>)}</select></label>
      <button disabled={!allowedViews.length} className={controlSm} onClick={() => { const id = crypto.randomUUID(); const kind = allowedViews.includes(viewKind) ? viewKind : allowedViews[0]; change({ ...workspace, blocks: [...workspace.blocks, { id, kind, source_id: sourceId, sources: [sourceId], settings: { pattern: kind === 'progression' && source?.kind === 'key' ? 'I-V-vi-IV' : null, labels: 'notes', comparison: 'highlight', shared_only: false, fret_start: null, fret_end: null } }], composition: [...workspace.composition, { items: [{ block_id: id, span: 12, priority: 'supporting' }] }] }); setAdding(false); addButton.current?.focus(); }}>Add selected view</button>
    </fieldset>}
    {resolved && branch.current_artifact_id && branch.saved_artifact_revision && <fieldset disabled={locked || workspace !== saved.current}><ExerciseComposer key={`${workspace.version}:${inspection?.kind ?? ''}`} sourceId={branch.current_artifact_id} revision={branch.saved_artifact_revision} selection={{workspace_version:workspace.version}} steps={exerciseSteps} /></fieldset>}
   </div>
   {tutorOpen && <>
    <div className="fixed inset-0 z-30 bg-black/20 lg:hidden" onClick={closeTutor} />
    <aside aria-label="Tutor"
      onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); closeTutor(); } }}
      className="fixed inset-x-2 bottom-2 z-40 flex max-h-[82dvh] flex-col rounded-xl bg-[var(--card-bg)] p-2 shadow-lg lg:sticky lg:inset-x-auto lg:bottom-auto lg:top-16 lg:z-auto lg:h-[calc(100dvh-5rem)] lg:w-[320px] lg:shrink-0 lg:self-start lg:rounded-none lg:bg-transparent lg:p-0 lg:shadow-none">
      <div className="mb-1 flex items-center justify-between gap-3 px-1 lg:mb-2 lg:px-0">
        <h2 className="font-bold">Tutor</h2>
        <button ref={tutorCloseButton} className={controlSm} onClick={closeTutor}>Close Tutor</button>
      </div>
      <TutorChat wide historyVersion={historyVersion} sessionId={sessionId} branchId={branch.id} tutorThreadId={branch.tutor_thread_id}
        onFocusChange={setTutorFocus} onPreview={previewTurn} inspection={inspection} workspaceVersion={workspace.version}
        disabled={busy || workspace !== saved.current} onWorkspaceResult={receiveTutorResult}
        onSendingChange={sending => { setTutorBusy(sending); onPendingChange(sending); }}
        emptyMessage="Ask about this music or request a change." />
    </aside>
   </>}
   </div>
  </div></>;
}
