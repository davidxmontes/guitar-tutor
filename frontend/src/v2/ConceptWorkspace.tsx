import { ExerciseComposer } from './ExerciseComposer';
import { workspaceLabel, cagedSelection } from './workspaceInspection';
import { PhysicalWorkspaceControls } from './PhysicalWorkspaceControls';
import { TutorChat } from './TutorChat';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '../api/client';
import type { TutorFocus, WorkspaceTurnResult, V2Branch } from '../types/v2';
import type { ConceptWorkspace, Inspection, ResolvedWorkspace, ScaleMode, WorkspaceBlock, ProgressionAction } from '../types/conceptWorkspace';
import { playNoteSequence, playChordSequence } from '../utils/audio';
import { ConceptWorkspaceBlock } from './ConceptWorkspaceBlocks';

const control = 'min-h-11 rounded-lg border border-[var(--border-primary)] bg-[var(--card-bg)] px-3 py-2 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-700)]';
const roots = ['C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const modes: ScaleMode[] = ['major', 'natural_minor', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'locrian', 'harmonic_minor', 'melodic_minor', 'pentatonic_major', 'pentatonic_minor', 'blues'];
const names = { fretboard: 'Fretboard', degree_strip: 'Degree strip', chord_diagrams: 'Chord diagrams', circle: 'Circle', progression: 'Progression', caged: 'CAGED' };

export function ConceptWorkspacePanel({ sessionId, branch, onBranchChange, onPendingChange }: { sessionId: string; branch: V2Branch; onBranchChange: (branch: V2Branch) => void; onPendingChange: (pending: boolean) => void }) {
  const [workspace, setWorkspace] = useState(branch.working_draft!);
  const [resolved, setResolved] = useState<ResolvedWorkspace | null>(null);
  const [tutorBusy, setTutorBusy] = useState(false);
  const [tutorFocus, setTutorFocus] = useState<TutorFocus | null>(null);
  const [preview, setPreview] = useState<{ messageId: string; snapshot: ConceptWorkspace; facts: ResolvedWorkspace; focus: TutorFocus | null } | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [inspection, setInspection] = useState<Inspection | null>(null);
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
  const saved = useRef(workspace);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopAudio = useRef<(() => void) | null>(null);
  const playbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tutorPanel = useRef<HTMLDialogElement>(null);
  const tutorButton = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const previewHeading = useRef<HTMLHeadingElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);

  useEffect(() => { (preview ? previewHeading : heading).current?.focus(); }, [preview]);

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
        setSourceId(next.blocks.find(b => b.id === blockId)!.source_id);
        if (action.step !== undefined) setInspection({ source_id:next.blocks.find(b => b.id === blockId)!.source_id, kind:'step', key:action.step });
      }
    } catch (error) { setError(`${String(error)}. Your draft is unchanged. Choose another edit or transpose distance.`); setStatus('Change not applied'); setBusy(false); onPendingChange(false); }
  };
  const hearProgression = (steps: {positions: {string: number; fret: number}[]; tuning: number[]}[]) => {
    stop(); setError(null);
    try { stopAudio.current = playChordSequence(steps); setPlaying(true); playbackTimer.current = setTimeout(() => { setPlaying(false); stopAudio.current = null; }, steps.length * 1200 + 200); }
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
    tutorPanel.current?.close(); stop(); setBusy(true); onPendingChange(true); setError(null);
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
    const blocks = workspace.blocks.filter(block => sources.has(block.source_id));
    change({ ...workspace, entities: workspace.entities.filter(entity => entity.id !== id), relations, blocks,
      composition: workspace.composition.map(row => ({ items: row.items.filter(item => blocks.some(block => block.id === item.block_id)) })).filter(row => row.items.length) });
    setSourceId(relations[0]?.id ?? workspace.entities.find(entity => entity.id !== id)!.id);
  };
  const relation = workspace.relations[0];
  const scales = workspace.entities.filter(e => e.kind === 'scale');
  const progressionBlock = workspace.blocks.find(b => b.kind === 'progression');
  const progression = resolved && progressionBlock ? resolved.progressions[progressionBlock.source_id] : null;
  const cagedId = resolved && (inspection && resolved.caged[inspection.source_id] ? inspection.source_id : Object.keys(resolved.caged)[0]);
  const caged = resolved && cagedId ? cagedSelection(cagedId, resolved, inspection) : null;
  const inspectedRegion = caged && inspection?.kind.startsWith('region') ? inspection.kind === 'region_note' ? `${caged.selected.positions.find(p => p.pitch_class === caged.pitch)?.note} in ${caged.selected.shape} shape` : inspection.kind === 'region_pair' ? `${caged.pair.key.replace(':', ' → ')} shapes` : `${caged.selected.shape} shape` : null;
  const physical = !progression && workspace.entities.some(e => e.kind === 'voicing');
  const transition = resolved && relation?.kind === 'transition' ? resolved.transitions[relation.id] : null;
  const summary = resolved && relation ? resolved.comparisons[relation.id] : null;
  const title = resolved && relation?.kind === 'compare' ? relation.entity_ids.map(id => resolved.scales[id].label).join(' vs ') : workspace.title;
  const placements = workspace.composition.flatMap((row, rowIndex) => row.items.map(item => ({ ...item, row: rowIndex })));
  const source = [...workspace.entities, ...workspace.relations].find(item => item.id === sourceId);
  const allowedViews = resolved && source ? Object.entries(resolved.block_sources).filter(([, kinds]) => kinds.includes(source.kind) && (source.kind !== 'chord' || ['major','minor'].includes(source.quality))).map(([kind]) => kind as WorkspaceBlock['kind']) : [];

  return <>{preview && <section className="min-w-0 space-y-5" aria-label="Turn snapshot preview">
    <header className="space-y-3">
      <p role="status" className="font-semibold">Preview · earlier Tutor turn · read only</p>
      <h2 ref={previewHeading} tabIndex={-1} className="text-2xl font-bold">{preview.snapshot.relations[0]?.kind === 'compare' ? preview.snapshot.relations[0].entity_ids.map(id => preview.facts.scales[id].label).join(' vs ') : preview.snapshot.title}</h2>
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

  <div hidden={Boolean(preview)} className="min-w-0 space-y-5">
    <header className="space-y-3 border-b border-[var(--border-primary)] pb-4">
      <p className="text-xs font-bold uppercase text-[var(--accent-700)]">Explore · working draft</p>
      <h2 ref={heading} tabIndex={-1} className="text-2xl font-bold">{title}</h2>
      {transition && <p>{transition.explanation}</p>}
      {summary && <p>{summary.shared.length} notes stay the same. {summary.removed.length > 0 && `Only in the first scale: ${summary.removed.map(n => n.note).join(', ')}. `}{summary.added.length > 0 && `Only in the second: ${summary.added.map(n => n.note).join(', ')}. `}{summary.removed.length === 0 && summary.added.length === 0 && 'These scales use the same pitches. '} Hear both scales, then select a changed note to find it on the guitar.</p>}
      <div className="flex flex-wrap items-center gap-3"><button type="button" className={control} disabled={!resolved || locked || Boolean(progression?.steps.some(s => !s.positions.length))} onClick={() => {
        if (playing) { stop(); return; }
        setError(null);
        try {
          if (caged) { hearProgression(caged.regions); return; }
          if (progression) { hearProgression(progression.steps); return; }
          if (physical) {
            const ids = relation?.kind === 'transition' ? relation.entity_ids : workspace.entities.filter(e => e.kind === 'voicing').map(e => e.id);
            stopAudio.current = playChordSequence(ids.map(id => resolved!.voicings[id])); setPlaying(true);
            playbackTimer.current = setTimeout(() => { setPlaying(false); stopAudio.current = null; }, ids.length * 1200 + 200);
            return;
          }
          const notes = (relation?.entity_ids ?? scales.map(e => e.id)).flatMap(id => resolved!.scales[id].playback);
          stopAudio.current = playNoteSequence(notes, workspace.tuning); setPlaying(true);
          playbackTimer.current = setTimeout(() => { setPlaying(false); stopAudio.current = null; }, notes.length * 300 + 400);
        } catch { setError('Audio could not start. Try Hear again. Your draft is unchanged.'); }
      }}>{playing ? 'Stop playback' : caged ? 'Hear adjacent regions' : progression ? 'Hear progression' : physical ? 'Hear D to G' : 'Hear comparison'}</button><button ref={tutorButton} aria-haspopup="dialog" className={control} onClick={() => tutorPanel.current?.show()}>Open Tutor</button><p role="status" className="text-sm text-[var(--text-secondary)]">{status}</p></div>
    </header>
    <form className="flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); void saveStudy(); }}>
      <label className="min-w-0">Study name<input required maxLength={120} value={studyName} disabled={locked}
        onChange={event => setStudyName(event.target.value)} className={`${control} block w-full focus-visible:outline-2 focus-visible:outline-[var(--accent-700)]`} /></label>
      <button className={control} disabled={locked || workspace !== saved.current || !studyName.trim()}>{branch.current_artifact_id ? 'Save version' : 'Save as study'}</button>
      {branch.current_artifact_id && <button type="button" className={control} disabled={locked || workspace !== saved.current || !studyName.trim()} onClick={() => saveStudy(true)}>Save as a new study</button>}
      {saveMessage && <p role="status">{saveMessage}</p>}
    </form>
    {saveError && <p role="alert">{saveError}</p>}
    {error && <div role="alert" className="space-y-2"><p>{error}</p>{!resolved && !busy && <button className={control} onClick={() => window.location.reload()}>Reload workspace</button>}{workspace !== saved.current && <div className="flex flex-wrap gap-2"><button className={control} disabled={locked} onClick={() => persist(workspace)}>Retry autosave</button><button className={control} onClick={() => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(workspace, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'concept-workspace.json'; link.click(); URL.revokeObjectURL(url); onPendingChange(false);
    }}>Download draft</button></div>}</div>}
    {physical && <PhysicalWorkspaceControls workspace={workspace} disabled={locked} onChange={change} />}
    {scales.length > 0 && <fieldset disabled={locked} className="space-y-3"><legend className="font-semibold">Change the music</legend>
      <label className="flex flex-wrap items-center gap-2">Both roots<select aria-label="Both roots" className={control} value={scales.every(e => e.root === scales[0].root) ? scales[0].root : ''} onChange={e => editScale(null, { root: e.target.value })}><option value="" disabled>Different roots</option>{roots.map(root => <option key={root}>{root}</option>)}</select></label>
      <details><summary className="cursor-pointer py-2">Edit each scale and tuning</summary><div className="flex flex-wrap gap-4 pt-2">{scales.map((entity, index) => <div key={entity.id} className="flex flex-wrap gap-2"><label>Scale {index + 1} root<select aria-label={`Scale ${index + 1} root`} className={`${control} block`} value={entity.root} onChange={e => editScale(entity.id, { root: e.target.value })}>{roots.map(root => <option key={root}>{root}</option>)}</select></label><label>Scale {index + 1} mode<select aria-label={`Scale ${index + 1} mode`} className={`${control} block max-w-full`} value={entity.mode} onChange={e => editScale(entity.id, { mode: e.target.value as ScaleMode })}>{modes.map(mode => <option key={mode} value={mode}>{mode.replaceAll('_', ' ')}</option>)}</select></label><button className={control} disabled={workspace.entities.length === 1} onClick={() => removeScale(entity.id)}>Remove scale {index + 1}</button></div>)}</div>
        <label className="mt-3 block">Tuning<select aria-label="Tuning" className={`${control} ml-2`} value={JSON.stringify(workspace.tuning)} onChange={e => change({ ...workspace, tuning: JSON.parse(e.target.value) })}><option value="[64,59,55,50,45,40]">Standard</option><option value="[64,59,55,50,45,38]">Drop D</option>{!['[64,59,55,50,45,40]', '[64,59,55,50,45,38]'].includes(JSON.stringify(workspace.tuning)) && <option value={JSON.stringify(workspace.tuning)}>Custom</option>}</select></label>
      </details>
    </fieldset>}
    <div className="flex min-h-11 flex-wrap items-center gap-3" role="status">{inspection ? <><button className={control} onClick={() => { setInspection(null); heading.current?.focus(); }}>Back</button><span>Inspecting {resolved ? inspectedRegion ? inspectedRegion : inspection.kind === 'step' ? `chord ${Number(inspection.key) + 1}` : inspection.kind === 'pitch' ? [...(resolved.scales[inspection.source_id]?.notes ?? []), ...(resolved.voicings[inspection.source_id]?.positions ?? [])].find(n => n.pitch_class === inspection.key)?.note : workspaceLabel(inspection.source_id, resolved) : ''} across compatible views</span></> : <span>{progression ? 'Select a chord to edit it or hear its next transition.' : 'Select a note to inspect it across views.'}</span>}</div>
    <div className="cw-composition">{placements.map(placement => {
      const block = workspace.blocks.find(item => item.id === placement.block_id)!;
      return <section key={block.id} aria-label={names[block.kind]} className="cw-block min-w-0 space-y-3 rounded-xl border border-[var(--border-primary)] bg-[var(--card-bg)] p-3 sm:p-4" style={{ '--cw-span': placement.span, '--cw-row': placement.row + 1, '--cw-order': placement.priority === 'primary' ? 0 : placement.priority === 'supporting' ? 1 : 2 } as React.CSSProperties}>
        <header className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">{names[block.kind]}</h3><button className={control} disabled={locked} onClick={() => { change({ ...workspace, blocks: workspace.blocks.filter(item => item.id !== block.id), composition: workspace.composition.map(row => ({ items: row.items.filter(item => item.block_id !== block.id) })).filter(row => row.items.length) }); addButton.current?.focus(); }}>Remove View</button></header>
        <fieldset disabled={locked} className="flex flex-wrap items-center gap-3"><label>Labels <select className={control} value={block.settings.labels} onChange={e => updateSettings(block, { labels: e.target.value as 'notes' | 'intervals' })}><option value="notes">Notes</option><option value="intervals">Intervals</option></select></label>
          {block.kind === 'fretboard' && !resolved?.caged[block.source_id] && <label>Frets <select className={control} value={`${block.settings.fret_start}-${block.settings.fret_end}`} onChange={e => { const [fret_start, fret_end] = e.target.value.split('-').map(Number); updateSettings(block, { fret_start, fret_end }); }}>{[...new Set([`${block.settings.fret_start}-${block.settings.fret_end}`, '0-5', '3-8', '5-10', '7-12'])].map(range => <option key={range}>{range}</option>)}</select></label>}
          {(workspace.relations.some(r => r.id === block.source_id) || resolved?.caged[block.source_id]) && <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={block.settings.shared_only} onChange={e => updateSettings(block, { shared_only: e.target.checked })} />{resolved?.caged[block.source_id] ? 'Shared positions only' : 'Shared notes only'}</label>}
        </fieldset>
        {resolved && <ConceptWorkspaceBlock block={block} workspace={workspace} resolved={resolved} inspection={inspection} onInspect={setInspection} tutorFocus={tutorFocus} disabled={locked} onWorkspaceChange={change} onProgressionAction={action => progressionAction(block.id, action)} onHear={hearProgression} onKeepRegion={shape => keepCaged(block.source_id, shape)} />}
      </section>;
    })}</div>
    <button ref={addButton} className={control} disabled={locked || workspace.blocks.length >= 12} aria-expanded={adding} onClick={() => setAdding(!adding)}>Add View</button>
    {adding && <fieldset disabled={locked} className="flex flex-wrap items-end gap-3 rounded-lg border border-[var(--border-primary)] p-3"><legend>Add a compatible view</legend>
      <label>Musical source<select className={`${control} block`} value={sourceId} onChange={e => setSourceId(e.target.value)}>{[...workspace.relations, ...workspace.entities].map(item => <option key={item.id} value={item.id}>{resolved ? workspaceLabel(item.id, resolved) : item.kind}</option>)}</select></label>
      <label>View type<select className={`${control} block`} value={allowedViews.includes(viewKind) ? viewKind : allowedViews[0] ?? ''} onChange={e => setViewKind(e.target.value as WorkspaceBlock['kind'])}>{allowedViews.map(kind => <option key={kind} value={kind}>{names[kind]}</option>)}</select></label>
      <button disabled={!allowedViews.length} className={control} onClick={() => { const id = crypto.randomUUID(); change({ ...workspace, blocks: [...workspace.blocks, { id, kind: allowedViews.includes(viewKind) ? viewKind : allowedViews[0], source_id: sourceId, settings: { pattern: (allowedViews.includes(viewKind) ? viewKind : allowedViews[0]) === 'progression' && source?.kind === 'key' ? 'I-V-vi-IV' : null, labels: 'notes', shared_only: false, fret_start: 0, fret_end: 5 } }], composition: [...workspace.composition, { items: [{ block_id: id, span: 12, priority: 'supporting' }] }] }); setAdding(false); addButton.current?.focus(); }}>Add selected view</button>
    </fieldset>}
    {resolved && branch.current_artifact_id && branch.saved_artifact_revision && <fieldset disabled={locked || workspace !== saved.current}><ExerciseComposer key={`${workspace.version}:${inspection?.source_id ?? ''}`} sourceId={branch.current_artifact_id} revision={branch.saved_artifact_revision} selection={{workspace_version:workspace.version}} steps={Object.values(resolved.scales).flatMap(scale => scale.playback.map(p => ({label:`${p.note} · ${p.degree}`,beats:1,positions:[p],tuning:workspace.tuning}))).concat((caged?.regions ?? progression?.steps ?? Object.values(resolved.voicings)).map((v,i) => ({label:'label' in v ? v.label : `Chord ${i+1}`,beats:4,positions:v.positions,tuning:v.tuning})))} /></fieldset>}
    <dialog ref={tutorPanel} aria-label="Tutor" onClose={() => tutorButton.current?.focus()} onKeyDown={event => {if(event.key === 'Escape') {event.preventDefault(); tutorPanel.current?.close();}}} className="fixed inset-auto right-3 bottom-3 z-50 m-0 max-h-[85dvh] w-[calc(100%_-_1.5rem)] max-w-lg overflow-y-auto rounded-xl border border-[var(--border-primary)] bg-[var(--card-bg)] p-4 text-[var(--text-primary)] shadow-lg">
      <header className="mb-3 flex items-center justify-between gap-3"><h2 className="font-bold">Tutor</h2><button className={control} onClick={() => tutorPanel.current?.close()}>Close Tutor</button></header>
      <TutorChat wide historyVersion={historyVersion} sessionId={sessionId} branchId={branch.id} tutorThreadId={branch.tutor_thread_id}
        onFocusChange={setTutorFocus} onPreview={previewTurn} inspection={inspection} workspaceVersion={workspace.version}
        disabled={busy || workspace !== saved.current} onWorkspaceResult={receiveTutorResult}
        onSendingChange={sending => { setTutorBusy(sending); onPendingChange(sending); }}
        emptyMessage="Ask about this music or request a change." />
    </dialog>
  </div></>;
}
