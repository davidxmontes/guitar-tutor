import { describe, expect, it } from 'vitest';
import { buildSongSections, defaultPassageLabel, selectMeasureRange } from './songStudyNavigation';

describe('song study measure navigation', () => {
  it('uses source markers as direct section ranges and chunks songs without markers', () => {
    const marked = Array.from({ length: 6 }, (_, index) => ({
      marker: index === 2 ? { text: 'Verse' } : index === 4 ? { text: 'Chorus' } : undefined,
    }));

    expect(buildSongSections(marked)).toEqual([
      { label: 'Measures 1–2', startIndex: 0, endIndex: 1 },
      { label: 'Verse', startIndex: 2, endIndex: 3 },
      { label: 'Chorus', startIndex: 4, endIndex: 5 },
    ]);
    expect(buildSongSections(Array.from({ length: 10 }, () => ({})))).toEqual([
      { label: 'Measures 1–8', startIndex: 0, endIndex: 7 },
      { label: 'Measures 9–10', startIndex: 8, endIndex: 9 },
    ]);
  });

  it('extends from the last measure for Shift and explicit touch range selection', () => {
    expect(selectMeasureRange(null, 3, false)).toEqual({ start: 3, end: 3, anchor: 3 });
    expect(selectMeasureRange(3, 6, true)).toEqual({ start: 3, end: 6, anchor: null });
    expect(selectMeasureRange(6, 2, true)).toEqual({ start: 2, end: 6, anchor: null });
  });

  it('creates a useful default keep label without changing existing named ranges', () => {
    expect(defaultPassageLabel('Verse', 9, 9)).toBe('Verse · M9');
    expect(defaultPassageLabel('Chorus', 17, 20)).toBe('Chorus · M17–20');
    const long = defaultPassageLabel('A'.repeat(140), 123, 128);
    expect(long).toHaveLength(120);
    expect(long).toMatch(/… · M123–128$/);
  });
});
