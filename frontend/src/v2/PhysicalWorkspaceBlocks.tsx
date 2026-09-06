import { adaptBlock, pitchClassOf } from './workspaceAdapter';
import { PhysicalChordDiagram } from './PhysicalChordDiagram';
import type {
  ConceptWorkspace, Resolved, ResolvedChord, ResolvedVoicing, TransitionRelation,
  TypedInspection, WorkspaceBlock, WorkspacePosition,
} from '../types/conceptWorkspace';

const button = 'min-h-11 rounded-lg border border-[var(--border-primary)] px-3 py-2 text-sm aria-pressed:ring-2 aria-pressed:ring-[var(--accent-700)]';

// chord-diagram (accepts: voicing, chord). A voicing renders its shape; a bare
// major/minor chord renders a row of diagrams from its `cagedRegions` (spec #88 BLK-04).
export function ChordDiagramBlock({ block, resolved, inspection, onInspect, readOnly }: {
  block: WorkspaceBlock; resolved: Resolved; inspection: TypedInspection | null;
  onInspect: (i: TypedInspection) => void; readOnly?: boolean;
}) {
  const adapted = adaptBlock(block, resolved);
  const comparison = adapted.comparison;
  const sharedOnly = block.settings.comparison === 'shared-only';
  const role = (index: number, pc: number): string =>
    !comparison ? '' : comparison.shared.includes(pc) ? 'shared' : index === 0 ? 'removed' : 'added';
  const litPos = (positions: WorkspacePosition[]) =>
    positions.filter(p => inspection?.kind === 'pitch' && p.pitch_class === inspection.pitch_class);
  const voicings = adapted.sources.filter((s): s is ResolvedVoicing => s.kind === 'voicing');

  // Bare chord(s), no voicing sibling -> CAGED region row.
  if (!voicings.length) {
    const chords = adapted.sources.filter((s): s is ResolvedChord => s.kind === 'chord');
    return <div className="space-y-4">{chords.map(chord => <div key={chord.id} className="space-y-2">
      {chords.length > 1 && <h4 className="text-sm font-semibold">{chord.label}</h4>}
      {(chord.cagedRegions ?? []).length
        ? <div className="flex flex-wrap gap-4">{chord.cagedRegions!.map(region => <div key={region.shape} className="space-y-1">
            <PhysicalChordDiagram positions={region.positions} tuning={chord.tuning} label={region.label} highlightedPositions={litPos(region.positions)} />
            <button className={button} disabled={readOnly} aria-label={`Inspect ${region.label}`}
              aria-pressed={inspection?.kind === 'region' && inspection.source_id === chord.id && inspection.key === region.shape}
              onClick={() => onInspect({ kind: 'region', source_id: chord.id, key: region.shape })}>{region.label}</button>
          </div>)}</div>
        : <p className="text-sm">{chord.notes.map(n => `${n.note} (${n.degree})`).join(' · ')}</p>}
    </div>)}</div>;
  }

  return <div className="space-y-3">
    <div className="flex flex-wrap gap-6">{adapted.sources.map((entity, index) => {
      if (entity.kind !== 'voicing') return null;
      const chord = entity.chord_id ? resolved.entities[entity.chord_id] : undefined;
      const chordResolved = chord?.kind === 'chord' ? chord : undefined;
      return <div key={entity.id} className="min-w-0 flex-1 space-y-2">
        <button className={button} disabled={readOnly} aria-label={`Inspect ${entity.label}`}
          aria-pressed={inspection?.kind === 'voicing' && inspection.entity_id === entity.id}
          onClick={() => onInspect({ kind: 'voicing', entity_id: entity.id })}>{entity.label}</button>
        <PhysicalChordDiagram positions={entity.positions} tuning={entity.tuning} label={entity.label} highlightedPositions={litPos(entity.positions)} />
        {chordResolved && <button className={button} disabled={readOnly} aria-label={`Inspect ${chordResolved.label}`}
          aria-pressed={inspection?.kind === 'chord' && 'entity_id' in inspection && inspection.entity_id === chordResolved.id}
          onClick={() => onInspect({ kind: 'chord', entity_id: chordResolved.id })}>{chordResolved.label}</button>}
        <div className="flex flex-wrap gap-2">{entity.positions.filter(p => !sharedOnly || role(index, p.pitch_class) === 'shared').map(p => <button key={p.string} disabled={readOnly} className={button}
          aria-label={`${entity.label}: ${p.note}, string ${p.string}, fret ${p.fret}`}
          aria-pressed={inspection?.kind === 'pitch' && inspection.pitch_class === p.pitch_class}
          onClick={() => onInspect({ kind: 'pitch', pitch_class: p.pitch_class })}>
          {block.settings.labels === 'notes' ? p.note : p.degree}{role(index, p.pitch_class) && <small className="block">{role(index, p.pitch_class)}</small>}
        </button>)}</div>
      </div>;
    })}</div>
  </div>;
}

// circle (accepts: key). One key -> the wheel with home + neighbours. When the
// workspace holds transitions in that key, chords ring the wheel with their functions.
export function CircleBlock({ block, workspace, resolved, inspection, onInspect, readOnly }: {
  block: WorkspaceBlock; workspace: ConceptWorkspace; resolved: Resolved;
  inspection: TypedInspection | null; onInspect: (i: TypedInspection) => void; readOnly?: boolean;
}) {
  const key = adaptBlock(block, resolved).sources.find(source => source.kind === 'key');
  if (key?.kind !== 'key') return null;
  const home = key.notes[0].note;
  // Pull-based: a derived {root, quality} inspection that is one of this key's own
  // diatonic chords lights its root on the wheel (spec #88 §6, INSP-01). key-family
  // pushes nothing — the circle finds the chord itself.
  const derivedRootPc = inspection?.kind === 'chord' && 'root' in inspection
    && key.diatonicChords.some((dc, i) => key.notes[i].pitch_class === inspection.root && dc.quality === inspection.quality)
    ? inspection.root : null;
  const transitions = workspace.relations.filter((r): r is TransitionRelation => r.kind === 'transition' && r.key_id === key.id);
  const chords = [...new Map(transitions.flatMap(rel => {
    const resolvedRel = resolved.relations[rel.id];
    const functions = resolvedRel?.kind === 'transition' ? resolvedRel.functions : [];
    return rel.entity_ids.map((vid, i) => {
      const voicing = resolved.entities[vid];
      const chordId = voicing?.kind === 'voicing' ? voicing.chord_id : null;
      const chord = chordId ? resolved.entities[chordId] : undefined;
      return chord?.kind === 'chord' ? [chordId!, { chord, fn: functions[i] ?? '' }] as const : null;
    }).filter((x): x is [string, { chord: ResolvedChord; fn: string }] => x !== null);
  })).entries()].map(([id, value]) => ({ id, ...value }));
  const pressed = (id: string, chord: ResolvedChord) =>
    (inspection?.kind === 'chord' && 'entity_id' in inspection && inspection.entity_id === id)
    || (inspection?.kind === 'chord' && 'root' in inspection && chord.notes[0].pitch_class === inspection.root && chord.quality === inspection.quality)
    || (inspection?.kind === 'pitch' && chord.notes.some(n => n.pitch_class === inspection.pitch_class));
  return <div className="space-y-3">
    <div className="relative mx-auto aspect-square w-full max-w-80" aria-label="Circle of Fifths">
      <div aria-hidden="true" className="absolute inset-[12%] rounded-full border-2 border-[var(--border-primary)]" />
      {key.circle.map((root, i) => {
        const lit = derivedRootPc !== null && pitchClassOf(root) === derivedRootPc;
        return <span key={root} aria-label={`Circle position ${root}`} aria-pressed={lit}
          className="absolute flex min-h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border bg-[var(--card-bg)] text-sm"
          style={{ left: `${50 + 42 * Math.sin(i * Math.PI / 6)}%`, top: `${50 - 42 * Math.cos(i * Math.PI / 6)}%`, fontWeight: root === home ? 800 : 400, outline: lit ? '2px solid var(--accent-700)' : undefined }}>{root}</span>;
      })}
      <strong className="absolute inset-[30%] flex items-center justify-center text-center">{key.label}<br />Home</strong>
    </div>
    {chords.length > 0 && <div className="flex flex-wrap gap-2">{chords.map(({ id, chord, fn }) => <button key={id} disabled={readOnly} className={button}
      aria-label={`Inspect ${chord.label}`} aria-pressed={pressed(id, chord)} onClick={() => onInspect({ kind: 'chord', entity_id: id })}>{chord.label} · {fn}</button>)}</div>}
    {chords.length > 0 && <details><summary className="min-h-11 cursor-pointer py-2">Harmonic detail</summary>{chords.map(({ id, chord }) => <p key={id}>{chord.label}: {chord.notes.map(n => `${n.note} (${n.degree})`).join(' · ')}</p>)}</details>}
  </div>;
}
