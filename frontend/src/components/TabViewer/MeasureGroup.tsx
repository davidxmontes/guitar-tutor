import type { CSSProperties } from 'react';
import type { TabBeat, TabMeasure, TabNote } from '../../types';

interface MeasureGroupProps {
  measures: TabMeasure[];
  startMeasureIndex: number;
  selectedBeatId: string | null;
  activeMeasureIndex?: number;
  compact?: boolean;
  showLeftBackSlice?: boolean;
  canStepPrev?: boolean;
  onStepPrev?: () => void;
  onBeatClick: (beat: TabBeat, beatId: string) => void;
}

const TAB_STRINGS = ['e|', 'B|', 'G|', 'D|', 'A|', 'E|'] as const;
const LINE_GAP_PX = 16;
const STAFF_HEIGHT_PX = LINE_GAP_PX * (TAB_STRINGS.length - 1);
const MIN_MEASURE_WIDTH_PX = 180;
const BEAT_SPACING_PX = 34;
const TAB_FONT_FAMILY =
  '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
const TECHNIQUE_SUFFIXES: Array<{ key: keyof TabNote; suffix: string }> = [
  { key: 'slide', suffix: '/' },
  { key: 'bend', suffix: 'b' },
  { key: 'hp', suffix: 'h' },
  { key: 'vibrato', suffix: '~' },
  { key: 'harmonic', suffix: '*' },
  { key: 'staccato', suffix: '.' },
  { key: 'accentuated', suffix: '>' },
];

function getBeats(measure: TabMeasure): TabBeat[] {
  const voices = measure.voices ?? [];
  if (voices.length === 0) return [];
  if (voices.length === 1) return voices[0]?.beats ?? [];

  // Pick the voice with the most playable notes to avoid rendering empty/rest-only voices.
  let bestBeats: TabBeat[] = voices[0]?.beats ?? [];
  let bestScore = -1;

  for (const voice of voices) {
    const beats = voice?.beats ?? [];
    const score = beats.reduce((acc, beat) => {
      const noteCount = (beat.notes ?? []).filter((n) => !n.rest && !n.dead).length;
      return acc + noteCount;
    }, 0);
    if (score > bestScore) {
      bestScore = score;
      bestBeats = beats;
    }
  }

  return bestBeats;
}

function hasRenderableNotes(beats: TabBeat[]): boolean {
  return beats.some((beat) => (beat.notes ?? []).some((note) => !note.rest));
}

function formatBeatAnnotation(beat: TabBeat): string {
  const parts: string[] = [];

  const chordName = beat.chord?.text?.trim();
  if (chordName) parts.push(chordName);

  if (beat.downStroke || beat.pickStroke === 'down') {
    parts.push('v');
  } else if (beat.upStroke || beat.pickStroke === 'up') {
    parts.push('^');
  }

  if (beat.letRing) parts.push('let ring');
  if (beat.palmMute) parts.push('P.M.');

  return parts.join(' ').trim();
}

function formatNote(note?: TabNote): string {
  if (!note || note.rest) return '';
  if (note.dead) return 'x';

  let text = String(note.fret ?? 0);
  if (note.ghost) text = `(${text})`;

  for (const { key, suffix } of TECHNIQUE_SUFFIXES) {
    if (note[key]) text += suffix;
  }
  return text;
}

function mapNotesByString(notes: TabNote[]): Map<number, TabNote> {
  const byString = new Map<number, TabNote>();
  for (const note of notes) {
    if (typeof note.string !== 'number') continue;
    if (note.string < 0 || note.string >= TAB_STRINGS.length) continue;
    if (!byString.has(note.string)) byString.set(note.string, note);
  }
  return byString;
}

export function MeasureGroup({
  measures,
  startMeasureIndex,
  selectedBeatId,
  activeMeasureIndex,
  compact = false,
  showLeftBackSlice = false,
  canStepPrev = false,
  onStepPrev,
  onBeatClick,
}: MeasureGroupProps) {
  const measureMinWidthPx = compact ? 150 : MIN_MEASURE_WIDTH_PX;
  const beatSpacingPx = compact ? 30 : BEAT_SPACING_PX;
  const noteFontSizePx = compact ? 12 : 13;
  const annotationFontSizePx = compact ? 9 : 10;
  const leftSliceWidthPx = compact && showLeftBackSlice ? 24 : 0;
  const leftSliceGapPx = compact && showLeftBackSlice ? 6 : 0;
  const leftPaddingPx = 32 + leftSliceWidthPx + leftSliceGapPx;

  return (
    <div className="overflow-x-auto">
      <div
        className={compact ? 'rounded-xl border px-2 py-3 md:px-3 md:py-4' : 'rounded-xl border px-3 py-4 md:px-5 md:py-5'}
        style={{
          borderColor: 'var(--border-primary)',
          backgroundColor: 'var(--card-bg)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div
          className="relative inline-block min-w-full pr-2 pt-6 pb-7"
          style={{ paddingLeft: leftPaddingPx }}
        >
          {compact && showLeftBackSlice && (
            <div
              className="absolute left-0 rounded-md overflow-hidden border"
              style={{
                top: 6,
                bottom: 7,
                width: leftSliceWidthPx,
                borderColor: 'var(--border-primary)',
                backgroundColor: 'var(--bg-secondary)',
              }}
            >
              <button
                type="button"
                onClick={onStepPrev}
                disabled={!canStepPrev}
                className="h-full w-full text-[10px] font-semibold flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ color: 'var(--text-secondary)' }}
                title="Go to previous measure"
              >
                ◀
              </button>
            </div>
          )}

          <div
            className="absolute top-6"
            style={{ left: leftSliceWidthPx + leftSliceGapPx, height: STAFF_HEIGHT_PX }}
          >
            {TAB_STRINGS.map((label, stringIdx) => (
              <div
                key={label}
                className="absolute text-[11px] font-semibold font-mono leading-none -translate-y-1/2"
                style={{
                  top: stringIdx * LINE_GAP_PX,
                  color: 'var(--text-muted)',
                  fontFamily: TAB_FONT_FAMILY,
                }}
              >
                {label}
              </div>
            ))}
          </div>

          <div className="relative inline-flex" style={{ height: STAFF_HEIGHT_PX }}>
            <div className="absolute inset-0 pointer-events-none">
              {TAB_STRINGS.map((_, stringIdx) => (
                <div
                  key={stringIdx}
                  className="absolute left-0 right-0 h-px"
                  style={{
                    top: stringIdx * LINE_GAP_PX,
                    backgroundColor: 'var(--border-secondary)',
                  }}
                />
              ))}
            </div>

            {measures.map((measure, localMeasureIdx) => {
              const measureIndex = startMeasureIndex + localMeasureIdx;
              const beats = getBeats(measure);
              const hasNotes = hasRenderableNotes(beats);
              const beatColumns = Math.max(beats.length, 1);
              const measureWidth = Math.max(measureMinWidthPx, beatColumns * beatSpacingPx);
              const beatHitWidth = Math.max(24, Math.min(52, measureWidth / beatColumns));
              const rawAnnotations = beats.map(formatBeatAnnotation);
              const compactAnnotations = rawAnnotations.map((annotation, idx) => {
                if (!annotation) return '';
                if (idx > 0 && annotation === rawAnnotations[idx - 1]) return '';
                return annotation;
              });
              const hasAnyAnnotation = compactAnnotations.some(Boolean);
              const measureHasSelectedBeat = beats.some(
                (_, beatIdx) => `${measureIndex}:${beatIdx}` === selectedBeatId,
              );
              const isPlayheadMeasure = activeMeasureIndex === measureIndex;
              const isHighlightedMeasure = measureHasSelectedBeat || isPlayheadMeasure;
              const isLastInRow = localMeasureIdx === measures.length - 1;
              const measureStyle: CSSProperties = {
                width: measureWidth,
                borderRight: isLastInRow
                  ? '1px solid var(--border-secondary)'
                  : '1px dashed var(--border-secondary)',
              };

              return (
                <div
                  key={measureIndex}
                  data-measure-index={measureIndex}
                  className="relative shrink-0"
                  style={measureStyle}
                >
                  {isHighlightedMeasure && (
                    <div
                      className="absolute inset-y-0 left-0 right-0 pointer-events-none"
                      style={{
                        backgroundColor: isPlayheadMeasure
                          ? 'rgba(16,185,129,0.08)'
                          : 'rgba(16,185,129,0.05)',
                        borderLeft: '1px solid rgba(16,185,129,0.3)',
                        borderRight: '1px solid rgba(16,185,129,0.3)',
                      }}
                    />
                  )}

                  <div
                    className="absolute left-3 text-[11px] font-semibold font-mono"
                    style={{
                      top: compact ? -24 : -26,
                      color: isHighlightedMeasure ? 'var(--accent-500)' : 'var(--text-muted)',
                      fontFamily: TAB_FONT_FAMILY,
                    }}
                  >
                    M{measureIndex + 1}
                  </div>

                  {measure.marker?.text && (
                    <div
                      className="absolute -top-10 left-2 rounded-full border px-2 py-0.5 text-[10px] font-semibold"
                      style={{
                        borderColor: 'var(--accent-600)',
                        color: 'var(--accent-600)',
                        backgroundColor: 'rgba(16,185,129,0.1)',
                      }}
                    >
                      {measure.marker.text}
                    </div>
                  )}

                  {beats.length > 0 && hasAnyAnnotation && (
                    <div
                      className="absolute left-0 right-0 z-20 flex pointer-events-none"
                      style={{ top: STAFF_HEIGHT_PX + 6 }}
                    >
                      {compactAnnotations.map((annotation, beatIdx) => (
                        <div
                          key={`annotation:${measureIndex}:${beatIdx}`}
                          className="px-0.5 leading-none text-center truncate"
                          style={{
                            width: `${100 / beatColumns}%`,
                            color: 'var(--text-secondary)',
                            fontSize: annotationFontSizePx,
                          }}
                          title={annotation || undefined}
                        >
                          {annotation || ' '}
                        </div>
                      ))}
                    </div>
                  )}

                  {beats.length > 0 &&
                    beats.map((beat, beatIdx) => {
                      const beatId = `${measureIndex}:${beatIdx}`;
                      const xPercent = ((beatIdx + 0.5) / beatColumns) * 100;
                      const notesByString = mapNotesByString(beat.notes ?? []);
                      const isSelected = beatId === selectedBeatId;

                      return (
                        <div key={beatId}>
                          <button
                            type="button"
                            onClick={() => onBeatClick(beat, beatId)}
                            className="absolute -top-5 -bottom-3 z-10 -translate-x-1/2 rounded-sm transition-colors"
                            style={{
                              left: `${xPercent}%`,
                              width: beatHitWidth,
                              backgroundColor: isSelected ? 'rgba(16,185,129,0.12)' : 'transparent',
                              border: isSelected
                                ? '1px solid rgba(16,185,129,0.35)'
                                : '1px solid transparent',
                            }}
                            title="Click to highlight this beat on the fretboard"
                          />

                          {TAB_STRINGS.map((_, stringIdx) => {
                            const text = formatNote(notesByString.get(stringIdx));
                            if (!text) return null;

                            return (
                              <div
                                key={`${beatId}:${stringIdx}`}
                                className="absolute z-20 -translate-x-1/2 -translate-y-1/2 px-1 font-semibold font-mono leading-none pointer-events-none"
                                style={{
                                  left: `${xPercent}%`,
                                  top: stringIdx * LINE_GAP_PX,
                                  color: isSelected ? 'var(--accent-400)' : 'var(--text-primary)',
                                  backgroundColor: 'var(--card-bg)',
                                  fontFamily: TAB_FONT_FAMILY,
                                  fontSize: noteFontSizePx,
                                }}
                              >
                                {text}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}

                  {beats.length === 0 && (
                    <div
                      className="absolute inset-0 flex items-center justify-center text-xs italic"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      No beats
                    </div>
                  )}

                  {beats.length > 0 && !hasNotes && (
                    <div
                      className="absolute inset-0 flex items-center justify-center text-sm italic pointer-events-none"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Rest ({beats.length} beat{beats.length === 1 ? '' : 's'})
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
