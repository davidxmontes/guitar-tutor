// One pure function: a Block + the uniform resolved model -> what a Block draws.
// Spec #88 §5 (Adapter output, sourceRoles inference, accepts). The T3-T5 block
// rebuilds all consume this; nothing here touches the DOM.
import type {
  AdaptedBlock, AdaptedComparison, Resolved, ResolvedEntity, ResolvedRelation,
  SourceRole, WorkspaceBlock,
} from '../types/conceptWorkspace';

// Frontend mirror of backend BLOCK_ACCEPTS.
export const BLOCK_ACCEPTS: Record<string, readonly string[]> = {
  fretboard: ['scale', 'chord', 'voicing', 'key', 'noteGroup', 'compare', 'transition'],
  degree_strip: ['scale', 'chord', 'compare'],
  chord_diagrams: ['voicing', 'chord'],
  circle: ['key'],
  progression: ['progression', 'key'],
  key_family: ['key'],
};

const pitchClasses = (notes: { pitch_class: number }[]): number[] =>
  [...new Set(notes.map((note) => note.pitch_class))];

// Pitch classes of a derived {root, quality} chord — for pull-based cross-view
// highlight (spec #88 INSP-01). Mirrors backend CHORD_INTERVALS; unknown quality
// falls back to a major triad.
const CHORD_INTERVALS: Record<string, number[]> = {
  major: [0, 4, 7], minor: [0, 3, 7], diminished: [0, 3, 6], augmented: [0, 4, 8],
  dominant7: [0, 4, 7, 10], major7: [0, 4, 7, 11], minor7: [0, 3, 7, 10],
};
export const chordPitchClasses = (root: number, quality: string): number[] =>
  (CHORD_INTERVALS[quality] ?? CHORD_INTERVALS.major).map((interval) => (root + interval) % 12);

// Note name ('A', 'F#', 'Bb', ...) -> pitch class 0-11. The circle-of-fifths spans
// carry names, not pitch classes, so a derived-chord inspection needs this to find
// its root on the wheel.
const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export const pitchClassOf = (note: string): number => {
  const base = LETTER_PC[note[0]?.toUpperCase()] ?? 0;
  const shift = [...note.slice(1)].reduce((sum, ch) => sum + (ch === '#' ? 1 : ch === 'b' ? -1 : 0), 0);
  return (base + shift + 12) % 12;
};

const sameTuning = (a: number[], b: number[]): boolean =>
  a.length === b.length && a.every((value, index) => value === b[index]);

function relationKind(relation: ResolvedRelation): 'compare' | 'transition' {
  return 'movement' in relation ? 'transition' : 'compare';
}

function compareNoteSets(first: number[], second: number[]): AdaptedComparison {
  const firstSet = new Set(first);
  const secondSet = new Set(second);
  const removed = first.filter((pc) => !secondSet.has(pc));
  const added = second.filter((pc) => !firstSet.has(pc));
  return {
    shared: first.filter((pc) => secondSet.has(pc)),
    added,
    removed,
    changed: [...new Set([...removed, ...added])],
  };
}

function relationComparison(relation: ResolvedRelation): AdaptedComparison {
  if (relation.kind === 'transition') {
    return {
      shared: relation.shared,
      added: relation.added,
      removed: relation.removed,
      changed: [...new Set([...relation.added, ...relation.removed])],
    };
  }
  const added = pitchClasses(relation.added);
  const removed = pitchClasses(relation.removed);
  return { shared: relation.shared, added, removed, changed: [...new Set([...removed, ...added])] };
}

export function adaptBlock(block: WorkspaceBlock, resolved: Resolved): AdaptedBlock {
  const accepts = BLOCK_ACCEPTS[block.kind] ?? [];
  const sources: ResolvedEntity[] = [];
  const relations: ResolvedRelation[] = [];
  const skipped: string[] = [];
  const layerIds: string[] = []; // ids that became `sources`, in bind order

  for (const id of block.sources) {
    const entity = resolved.entities[id];
    if (entity) {
      if (accepts.includes(entity.kind)) {
        sources.push(block.kind === 'progression' && entity.kind === 'key' && entity.derivedProgression
          ? entity.derivedProgression : entity);
        layerIds.push(id);
      } else {
        skipped.push(id);
      }
      continue;
    }
    const relation = resolved.relations[id];
    if (relation) {
      if (accepts.includes(relationKind(relation))) relations.push(relation);
      else skipped.push(id);
      continue;
    }
    skipped.push(id);
  }

  // A bound compare/transition relation contributes its two members as layers.
  const relation = relations[0];
  for (const relation of relations) {
    for (const memberId of relation.entity_ids) {
      const member = resolved.entities[memberId];
      if (member && !layerIds.includes(memberId)) {
        sources.push(member);
        layerIds.push(memberId);
      }
    }
  }

  // --- role inference (spec #88 §5 table) ---
  let sourceRoles: Record<string, SourceRole> = {};
  let comparison: AdaptedComparison | undefined;

  if (relation) {
    for (const id of layerIds) sourceRoles[id] = 'context';
    for (const bound of relations) {
      for (const memberId of bound.entity_ids) sourceRoles[memberId] = 'primary';
    }
    comparison = relationComparison(relation);
  } else if (layerIds.length === 2 && sources[0].kind === sources[1].kind) {
    sourceRoles[layerIds[0]] = 'primary';
    sourceRoles[layerIds[1]] = 'primary';
    comparison = compareNoteSets(pitchClasses(sources[0].notes), pitchClasses(sources[1].notes));
  } else {
    layerIds.forEach((id, index) => {
      sourceRoles[id] = index === 0 ? 'primary' : 'context';
    });
  }

  // A noteGroup is always a highlight layer, wherever it sits in the list.
  for (const entity of sources) {
    if (entity.kind === 'noteGroup') sourceRoles[entity.id] = 'highlight';
  }

  // An explicit per-block override wins over inference.
  if (block.source_roles) sourceRoles = { ...sourceRoles, ...block.source_roles };

  // `plain` shows every layer with no diff colouring -> no comparison payload.
  if (block.settings.comparison === 'plain') comparison = undefined;

  // --- conflicts ---
  const primaryId = Object.keys(sourceRoles).find((id) => sourceRoles[id] === 'primary');
  const primary = (primaryId && resolved.entities[primaryId]) || sources[0];
  const tuningMismatch = primary
    ? sources
        .filter((entity) => entity.id !== primary.id && !sameTuning(entity.tuning, primary.tuning))
        .map((entity) => entity.id)
    : [];

  return {
    sources,
    relations,
    sourceRoles,
    ...(comparison ? { comparison } : {}),
    conflicts: { tuningMismatch, skipped },
    settings: block.settings,
  };
}
