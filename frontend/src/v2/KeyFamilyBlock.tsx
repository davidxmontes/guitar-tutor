import { adaptBlock } from './workspaceAdapter';
import type { Resolved, TypedInspection, WorkspaceBlock } from '../types/conceptWorkspace';

const button = 'min-h-11 rounded-lg border border-[var(--border-primary)] bg-[var(--card-bg)] px-3 py-2 text-sm aria-pressed:ring-2 aria-pressed:ring-[var(--accent-700)]';
const suffix = (quality: string) => (quality === 'minor' ? 'm' : quality === 'diminished' ? 'dim' : '');

// key-family (accepts: key). Renders the bound key's diatonicChords as a
// numeral / chord / quality row; clicking a numeral inspects that derived chord
// as {root, quality} (spec #88 BLK-06, INSP-02). Cross-view reaction is pull-based
// — this pushes nothing to the circle or fretboard.
export function KeyFamilyBlock({ block, resolved, inspection, onInspect, readOnly, onMaterialize }: {
  block: WorkspaceBlock; resolved: Resolved; inspection: TypedInspection | null;
  onInspect: (i: TypedInspection) => void; readOnly?: boolean;
  onMaterialize?: (i: Extract<TypedInspection, { kind: 'chord'; root: number }>) => void;
}) {
  const key = adaptBlock(block, resolved).sources[0];
  if (key?.kind !== 'key') return null;

  return <div className="flex flex-wrap gap-2">{key.diatonicChords.map((chord, index) => {
    const root = key.notes[index].pitch_class;
    const target = { kind: 'chord', root, quality: chord.quality } as const;
    const pressed = inspection?.kind === 'chord' && 'root' in inspection
      && inspection.root === root && inspection.quality === chord.quality;
    const name = `${chord.root}${suffix(chord.quality)}`;
    return <div key={chord.numeral} className="flex flex-col items-stretch gap-1">
      <button type="button" disabled={readOnly} className={button}
        aria-label={`Inspect ${chord.numeral} ${name}, ${chord.quality}`} aria-pressed={pressed}
        onClick={() => onInspect(target)}>
        <strong className="block">{chord.numeral}</strong>
        <span className="block">{name}</span>
        <small className="block text-[var(--text-secondary)]">{chord.quality}</small>
      </button>
      {pressed && onMaterialize && !readOnly && <button type="button" className={`${button} text-xs`}
        aria-label={`Materialize ${name}`} onClick={() => onMaterialize(target)}>Materialize</button>}
    </div>;
  })}</div>;
}
