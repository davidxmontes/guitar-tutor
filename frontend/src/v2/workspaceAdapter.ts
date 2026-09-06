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
        sources.push(entity);
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
  if (relation) {
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
    for (const memberId of relation.entity_ids) sourceRoles[memberId] = 'primary';
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
        .filter((entity) => sourceRoles[entity.id] !== 'primary' && !sameTuning(entity.tuning, primary.tuning))
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
