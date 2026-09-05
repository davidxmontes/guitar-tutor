import { useEffect, useRef, useState } from 'react';
import { apiClient } from '../api/client';
import type { V2Branch } from '../types/v2';
import type { ConceptWorkspace, Inspection, ResolvedWorkspace, ScaleMode, WorkspaceBlock } from '../types/conceptWorkspace';
import { playNoteSequence } from '../utils/audio';
import { ConceptWorkspaceBlock } from './ConceptWorkspaceBlocks';

const control = 'min-h-11 rounded-lg border border-[var(--border-primary)] bg-[var(--card-bg)] px-3 py-2 disabled:opacity-50';
const roots = ['C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const modes: ScaleMode[] = ['major', 'natural_minor', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'locrian', 'harmonic_minor', 'melodic_minor', 'pentatonic_major', 'pentatonic_minor', 'blues'];
const names = { fretboard: 'Fretboard', degree_strip: 'Degree strip' };

export function ConceptWorkspacePanel({ sessionId, branch, onBranchChange }: { sessionId: string; branch: V2Branch; onBranchChange: (branch: V2Branch) => void }) {
  const [workspace, setWorkspace] = useState(branch.working_draft!);
  const [resolved, setResolved] = useState<ResolvedWorkspace | null>(null);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('Loading workspace…');
  const [busy, setBusy] = useState(true);
  const [adding, setAdding] = useState(false);
  const [sourceId, setSourceId] = useState(workspace.relations[0]?.id ?? workspace.entities[0].id);
  const [viewKind, setViewKind] = useState<WorkspaceBlock['kind']>('fretboard');
  const [playing, setPlaying] = useState(false);
  const saved = useRef(workspace);
  const stopAudio = useRef<(() => void) | null>(null);
  const playbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);

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
  const persist = async (next: ConceptWorkspace) => {
    setBusy(true); setStatus('Saving draft…');
    try {
      const updated = await apiClient.saveConceptWorkspace(sessionId, branch.id, next);
      saved.current = updated.working_draft!;
      setWorkspace(saved.current); onBranchChange(updated); setStatus('Draft autosaved'); setError(null);
    } catch (err) { setStatus('Draft not saved'); setError(`${String(err)}. Your edits are still here. Retry, or download your draft before reloading if it changed elsewhere.`); }
    finally { setBusy(false); }
  };

  const change = async (next: ConceptWorkspace) => {
    stop(); setBusy(true); setError(null); setStatus('Updating views…');
    try {
      const facts = await apiClient.resolveConceptWorkspace(next);
      setWorkspace(next); setResolved(facts); setInspection(null);
      // Coalesce presentation updates before writing the branch; controls stay locked through the save.
      await new Promise(resolve => setTimeout(resolve, 250));
      await persist(next);
    } catch { setError('That combination is not supported. Your previous draft is unchanged.'); setStatus('Change not applied'); setBusy(false); }
  };
  const updateSettings = (block: WorkspaceBlock, patch: Partial<WorkspaceBlock['settings']>) => change({ ...workspace, blocks: workspace.blocks.map(item => item.id === block.id ? { ...item, settings: { ...item.settings, ...patch } } : item) });
  const editScale = (id: string | null, patch: { root?: string; mode?: ScaleMode }) => change({ ...workspace, entities: workspace.entities.map(entity => !id || entity.id === id ? { ...entity, ...patch } : entity) });
  const relation = workspace.relations[0];
  const summary = resolved && relation ? resolved.comparisons[relation.id] : null;
  const title = resolved && relation ? relation.entity_ids.map(id => resolved.scales[id].label).join(' vs ') : workspace.title;
  const placements = workspace.composition.flatMap((row, rowIndex) => row.items.map(item => ({ ...item, row: rowIndex })));
  const source = [...workspace.entities, ...workspace.relations].find(item => item.id === sourceId);
  const allowedViews = resolved && source ? Object.entries(resolved.block_sources).filter(([, kinds]) => kinds.includes(source.kind)).map(([kind]) => kind as WorkspaceBlock['kind']) : [];

  return <div className="min-w-0 space-y-5">
    <header className="space-y-3 border-b border-[var(--border-primary)] pb-4">
      <p className="text-xs font-bold uppercase text-[var(--accent-700)]">Explore · working draft</p>
      <h2 ref={heading} tabIndex={-1} className="text-2xl font-bold">{title}</h2>
      {summary && <p>{summary.shared.length} notes stay the same. {summary.removed.length ? `${summary.removed.map(n => n.note).join(', ')} change to ${summary.added.map(n => n.note).join(', ') || 'notes already shared'}.` : 'These scales use the same pitches.'} Hear both scales, then select a changed note to find it on the guitar.</p>}
      <div className="flex flex-wrap items-center gap-3"><button type="button" className={control} disabled={!resolved || busy} onClick={() => {
        if (playing) { stop(); return; }
        try {
          const notes = (relation?.entity_ids ?? workspace.entities.map(e => e.id)).flatMap(id => resolved!.scales[id].playback);
          stopAudio.current = playNoteSequence(notes, workspace.tuning); setPlaying(true);
          playbackTimer.current = setTimeout(() => { setPlaying(false); stopAudio.current = null; }, notes.length * 300 + 400);
        } catch { setError('Audio could not start. Try Hear again. Your draft is unchanged.'); }
      }}>{playing ? 'Stop playback' : 'Hear comparison'}</button><p role="status" className="text-sm text-[var(--text-secondary)]">{status}</p></div>
    </header>
    {error && <div role="alert" className="space-y-2"><p>{error}</p>{workspace !== saved.current && <div className="flex flex-wrap gap-2"><button className={control} disabled={busy} onClick={() => persist(workspace)}>Retry autosave</button><button className={control} onClick={() => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(workspace, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'concept-workspace.json'; link.click(); URL.revokeObjectURL(url);
    }}>Download draft</button></div>}</div>}
    <fieldset disabled={busy} className="space-y-3"><legend className="font-semibold">Change the music</legend>
      <label className="flex flex-wrap items-center gap-2">Both roots<select aria-label="Both roots" className={control} value={workspace.entities.every(e => e.root === workspace.entities[0].root) ? workspace.entities[0].root : ''} onChange={e => editScale(null, { root: e.target.value })}><option value="" disabled>Different roots</option>{roots.map(root => <option key={root}>{root}</option>)}</select></label>
      <details><summary className="cursor-pointer py-2">Edit each scale and tuning</summary><div className="flex flex-wrap gap-4 pt-2">{workspace.entities.map((entity, index) => <div key={entity.id} className="flex flex-wrap gap-2"><label>Scale {index + 1} root<select aria-label={`Scale ${index + 1} root`} className={`${control} block`} value={entity.root} onChange={e => editScale(entity.id, { root: e.target.value })}>{roots.map(root => <option key={root}>{root}</option>)}</select></label><label>Scale {index + 1} mode<select aria-label={`Scale ${index + 1} mode`} className={`${control} block max-w-full`} value={entity.mode} onChange={e => editScale(entity.id, { mode: e.target.value as ScaleMode })}>{modes.map(mode => <option key={mode} value={mode}>{mode.replaceAll('_', ' ')}</option>)}</select></label></div>)}</div>
        <label className="mt-3 block">Tuning<select className={`${control} ml-2`} value={JSON.stringify(workspace.tuning)} onChange={e => change({ ...workspace, tuning: JSON.parse(e.target.value) })}><option value="[64,59,55,50,45,40]">Standard</option><option value="[64,59,55,50,45,38]">Drop D</option>{!['[64,59,55,50,45,40]', '[64,59,55,50,45,38]'].includes(JSON.stringify(workspace.tuning)) && <option value={JSON.stringify(workspace.tuning)}>Custom</option>}</select></label>
      </details>
    </fieldset>
    <div className="flex min-h-11 flex-wrap items-center gap-3" role="status">{inspection ? <><button className={control} onClick={() => { setInspection(null); heading.current?.focus(); }}>Back</button><span>Inspecting {resolved?.scales[inspection.source_id]?.notes.find(n => n.pitch_class === inspection.key)?.note} across compatible views</span></> : <span>Select a note to inspect it across views.</span>}</div>
    <div className="cw-composition">{placements.map(placement => {
      const block = workspace.blocks.find(item => item.id === placement.block_id)!;
      return <section key={block.id} aria-label={names[block.kind]} className="cw-block min-w-0 space-y-3 rounded-xl border border-[var(--border-primary)] bg-[var(--card-bg)] p-3 sm:p-4" style={{ '--cw-span': placement.span, '--cw-row': placement.row + 1, '--cw-order': placement.priority === 'primary' ? 0 : placement.priority === 'supporting' ? 1 : 2 } as React.CSSProperties}>
        <header className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">{names[block.kind]}</h3><button className={control} disabled={busy} onClick={() => { change({ ...workspace, blocks: workspace.blocks.filter(item => item.id !== block.id), composition: workspace.composition.map(row => ({ items: row.items.filter(item => item.block_id !== block.id) })).filter(row => row.items.length) }); addButton.current?.focus(); }}>Remove View</button></header>
        <fieldset disabled={busy} className="flex flex-wrap items-center gap-3"><label>Labels <select className={control} value={block.settings.labels} onChange={e => updateSettings(block, { labels: e.target.value as 'notes' | 'intervals' })}><option value="notes">Notes</option><option value="intervals">Intervals</option></select></label>
          {block.kind === 'fretboard' && <label>Frets <select className={control} value={`${block.settings.fret_start}-${block.settings.fret_end}`} onChange={e => { const [fret_start, fret_end] = e.target.value.split('-').map(Number); updateSettings(block, { fret_start, fret_end }); }}>{['0-5', '3-8', '5-10', '7-12'].map(range => <option key={range}>{range}</option>)}</select></label>}
          {workspace.relations.some(r => r.id === block.source_id) && <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={block.settings.shared_only} onChange={e => updateSettings(block, { shared_only: e.target.checked })} />Shared notes only</label>}
        </fieldset>
        {resolved && <ConceptWorkspaceBlock block={block} workspace={workspace} resolved={resolved} inspection={inspection} onInspect={setInspection} />}
      </section>;
    })}</div>
    <button ref={addButton} className={control} disabled={busy || workspace.blocks.length >= 12} aria-expanded={adding} onClick={() => setAdding(!adding)}>Add View</button>
    {adding && <fieldset disabled={busy} className="flex flex-wrap items-end gap-3 rounded-lg border border-[var(--border-primary)] p-3"><legend>Add a compatible view</legend>
      <label>Musical source<select className={`${control} block`} value={sourceId} onChange={e => setSourceId(e.target.value)}>{[...workspace.relations, ...workspace.entities].map(item => <option key={item.id} value={item.id}>{item.kind === 'compare' ? 'Scale comparison' : resolved?.scales[item.id].label}</option>)}</select></label>
      <label>View type<select className={`${control} block`} value={viewKind} onChange={e => setViewKind(e.target.value as WorkspaceBlock['kind'])}>{allowedViews.map(kind => <option key={kind} value={kind}>{names[kind]}</option>)}</select></label>
      <button className={control} onClick={() => { const id = crypto.randomUUID(); change({ ...workspace, blocks: [...workspace.blocks, { id, kind: viewKind, source_id: sourceId, settings: { labels: 'notes', shared_only: false, fret_start: 0, fret_end: 5 } }], composition: [...workspace.composition, { items: [{ block_id: id, span: 12, priority: 'supporting' }] }] }); setAdding(false); addButton.current?.focus(); }}>Add selected view</button>
    </fieldset>}
  </div>;
}
