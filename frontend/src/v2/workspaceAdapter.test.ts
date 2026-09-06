import { describe, expect, it } from 'vitest';
import { adaptBlock } from './workspaceAdapter';
import type {
  BlockSettings, Resolved, ResolvedEntity, ResolvedRelation, WorkspaceBlock,
} from '../types/conceptWorkspace';

const STD = [64, 59, 55, 50, 45, 40];
const DROP_D = [64, 59, 55, 50, 45, 38];

const notes = (pcs: number[]) =>
  pcs.map((pc) => ({ note: 'X', degree: '1', pitch_class: pc, offset: 0 }));

const scale = (id: string, pcs: number[], tuning = STD): ResolvedEntity => ({
  id, kind: 'scale', label: id, notes: notes(pcs), positions: [], tuning,
});
const chord = (id: string, pcs: number[], tuning = STD): ResolvedEntity => ({
  id, kind: 'chord', label: id, quality: 'major', notes: notes(pcs), positions: [], tuning,
});
const voicing = (id: string, pcs: number[], tuning = STD): ResolvedEntity => ({
  id, kind: 'voicing', label: id, chord_id: null, notes: notes(pcs), positions: [], tuning,
});
const noteGroup = (id: string, pcs: number[], tuning = STD): ResolvedEntity => ({
  id, kind: 'noteGroup', label: id, notes: notes(pcs), positions: [], tuning,
});

const settings: BlockSettings = { labels: 'notes', fret_start: null, fret_end: null };

const block = (over: Partial<WorkspaceBlock>): WorkspaceBlock => ({
  id: 'b', kind: 'fretboard', source_id: over.sources?.[0] ?? 'x', sources: ['x'], settings, ...over,
});

const resolved = (entities: ResolvedEntity[], relations: Record<string, ResolvedRelation> = {}): Resolved => ({
  entities: Object.fromEntries(entities.map((e) => [e.id, e])),
  relations,
});

describe('adaptBlock — sourceRoles inference table', () => {
  it('1 entity -> primary', () => {
    const r = adaptBlock(block({ sources: ['s1'] }), resolved([scale('s1', [0, 2, 4])]));
    expect(r.sourceRoles).toEqual({ s1: 'primary' });
    expect(r.comparison).toBeUndefined();
  });

  it('2 same kind -> both primary + computed comparison', () => {
    const r = adaptBlock(
      block({ sources: ['s1', 's2'] }),
      resolved([scale('s1', [0, 2, 4, 7]), scale('s2', [0, 3, 4, 9])]),
    );
    expect(r.sourceRoles).toEqual({ s1: 'primary', s2: 'primary' });
    expect(r.comparison).toEqual({
      shared: [0, 4],
      removed: [2, 7],
      added: [3, 9],
      changed: [2, 7, 3, 9],
    });
  });

  it('2 different kind -> primary + context', () => {
    const r = adaptBlock(
      block({ sources: ['c1', 'v1'] }),
      resolved([chord('c1', [0, 4, 7]), voicing('v1', [0, 4, 7])]),
    );
    expect(r.sourceRoles).toEqual({ c1: 'primary', v1: 'context' });
    expect(r.comparison).toBeUndefined();
  });

  it('3+ entities -> first primary, rest context', () => {
    const r = adaptBlock(
      block({ sources: ['a', 'b', 'c'] }),
      resolved([scale('a', [0]), chord('b', [2]), voicing('c', [4])]),
    );
    expect(r.sourceRoles).toEqual({ a: 'primary', b: 'context', c: 'context' });
  });

  it('any list containing a noteGroup -> that layer is highlight', () => {
    const r = adaptBlock(
      block({ sources: ['s1', 'ng'] }),
      resolved([scale('s1', [0, 2]), noteGroup('ng', [6])]),
    );
    expect(r.sourceRoles).toEqual({ s1: 'primary', ng: 'highlight' });
  });

  it('a compare relation -> members primary + payload comparison', () => {
    const rel: ResolvedRelation = {
      kind: 'compare', entity_ids: ['s1', 's2'],
      shared: [0, 4], added: notes([3]), removed: notes([7]),
    };
    const r = adaptBlock(
      block({ sources: ['rel'] }),
      resolved([scale('s1', [0, 4, 7]), scale('s2', [0, 3, 4])], { rel }),
    );
    expect(r.relations).toEqual([rel]);
    expect(r.sourceRoles).toEqual({ s1: 'primary', s2: 'primary' });
    expect(r.comparison).toEqual({ shared: [0, 4], added: [3], removed: [7], changed: [7, 3] });
    expect(r.sources.map((e) => e.id)).toEqual(['s1', 's2']);
  });

  it('a transition relation -> members primary + comparison, relation carries movement', () => {
    const rel: ResolvedRelation = {
      kind: 'transition', entity_ids: ['v1', 'v2'], key_id: 'k', label: 'D -> G',
      functions: ['V', 'I'], shared: [2], added: [7], removed: [6], explanation: '',
      movement: [{ string: 1, before: null, after: null, kind: 'moving', semitones: 1 }],
    };
    const r = adaptBlock(
      block({ sources: ['rel'] }),
      resolved([voicing('v1', [2, 6]), voicing('v2', [2, 7])], { rel }),
    );
    expect(r.sourceRoles).toEqual({ v1: 'primary', v2: 'primary' });
    expect(r.comparison).toEqual({ shared: [2], added: [7], removed: [6], changed: [7, 6] });
    expect(r.relations[0].kind === 'transition' && r.relations[0].movement).toHaveLength(1);
  });

  it('block.source_roles present -> overrides inference', () => {
    const r = adaptBlock(
      block({ sources: ['s1', 's2'], source_roles: { s2: 'context' } }),
      resolved([scale('s1', [0]), scale('s2', [0])]),
    );
    expect(r.sourceRoles).toEqual({ s1: 'primary', s2: 'context' });
  });
});

describe('adaptBlock — comparison payload gating', () => {
  it("comparison 'plain' omits the payload", () => {
    const r = adaptBlock(
      block({ sources: ['s1', 's2'], settings: { ...settings, comparison: 'plain' } }),
      resolved([scale('s1', [0, 2]), scale('s2', [0, 3])]),
    );
    expect(r.comparison).toBeUndefined();
  });

  it("comparison 'shared-only' keeps the payload", () => {
    const r = adaptBlock(
      block({ sources: ['s1', 's2'], settings: { ...settings, comparison: 'shared-only' } }),
      resolved([scale('s1', [0, 2]), scale('s2', [0, 3])]),
    );
    expect(r.comparison?.shared).toEqual([0]);
  });
});

describe('adaptBlock — conflicts', () => {
  it('tuningMismatch lists a non-primary source whose tuning differs from the primary', () => {
    const r = adaptBlock(
      block({ sources: ['c1', 'v1'] }),
      resolved([chord('c1', [0, 4, 7], STD), voicing('v1', [0, 4, 7], DROP_D)]),
    );
    expect(r.sourceRoles).toEqual({ c1: 'primary', v1: 'context' });
    expect(r.conflicts.tuningMismatch).toEqual(['v1']);
  });

  it('skipped lists a source whose kind is outside the block accepts', () => {
    const r = adaptBlock(
      block({ kind: 'degree_strip', sources: ['s1', 'v1'] }),
      resolved([scale('s1', [0, 2]), voicing('v1', [0])]),
    );
    expect(r.conflicts.skipped).toEqual(['v1']);
    expect(r.sources.map((e) => e.id)).toEqual(['s1']);
  });
});
