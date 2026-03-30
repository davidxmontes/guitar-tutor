import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../../stores/useAppStore';
import type { HighlightedNote, TabBeat, TabData, TabMeasure } from '../../types';
import { MeasureGroup } from './MeasureGroup';

interface TabViewerProps {
  tabData: TabData;
  measuresPerRow?: number;
  tuningNotes?: string[];
}

function chunkMeasures(tabMeasures: TabData['measures'], size: number): TabData['measures'][] {
  const groups: TabData['measures'][] = [];
  for (let i = 0; i < tabMeasures.length; i += size) {
    groups.push(tabMeasures.slice(i, i + size));
  }
  return groups;
}

function toHighlightedNotes(beat: TabBeat): HighlightedNote[] {
  const seen = new Set<string>();
  const highlights: HighlightedNote[] = [];

  for (const note of beat.notes ?? []) {
    if (note.rest || note.dead) continue;
    if (typeof note.string !== 'number' || typeof note.fret !== 'number') continue;

    // Songsterr strings are 0-5 (high e -> low E), fretboard uses 1-6.
    const mappedString = note.string + 1;
    if (mappedString < 1 || mappedString > 6) continue;

    const key = `${mappedString}:${note.fret}`;
    if (seen.has(key)) continue;
    seen.add(key);

    highlights.push({
      string: mappedString,
      fret: note.fret,
    });
  }

  return highlights;
}

function getBeatsFromMeasure(measure: TabMeasure): TabBeat[] {
  const voices = measure.voices ?? [];
  if (voices.length === 0) return [];
  if (voices.length === 1) return voices[0]?.beats ?? [];

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

function getBeatsPerMeasure(measure?: TabMeasure): number {
  if (!measure) return 4;
  const numerator = measure.header?.timeSignature?.numerator;
  if (typeof numerator === 'number' && numerator > 0) return numerator;
  return 4;
}

export function TabViewer({ tabData, measuresPerRow = 4, tuningNotes }: TabViewerProps) {
  const setHighlightedNotes = useAppStore((s) => s.setHighlightedNotes);
  const selectedBeatId = useAppStore((s) => s.selectedBeatId);
  const playheadMeasureIndex = useAppStore((s) => s.playheadMeasureIndex);
  const setSelectedBeatId = useAppStore((s) => s.setSelectedBeatId);
  const setPlayheadMeasureIndex = useAppStore((s) => s.setPlayheadMeasureIndex);
  const focusMeasureBeat = useAppStore((s) => s.focusMeasureBeat);
  const [isPlaying, setIsPlaying] = useState(false);
  const [focusFretboardMode, setFocusFretboardMode] = useState(true);
  const focusWindowSize = Math.max(1, measuresPerRow);

  const measureRows = useMemo(() => {
    const measures = tabData.measures ?? [];
    if (!focusFretboardMode) {
      return chunkMeasures(measures, Math.max(1, measuresPerRow)).map((rowMeasures, rowIndex) => ({
        measures: rowMeasures,
        startMeasureIndex: rowIndex * Math.max(1, measuresPerRow),
      }));
    }

    const start = Math.max(0, playheadMeasureIndex);
    const end = Math.min(measures.length, start + focusWindowSize);
    return [
      {
        measures: measures.slice(start, end),
        startMeasureIndex: start,
      },
    ];
  }, [focusFretboardMode, measuresPerRow, playheadMeasureIndex, tabData.measures]);
  const bpm = tabData.automations?.tempo?.[0]?.bpm;
  const effectiveBpm = typeof bpm === 'number' && bpm > 0 ? bpm : 120;
  const measureCount = tabData.measures?.length ?? 0;
  const beatSequence = useMemo(() => {
    const sequence: Array<{ measureIndex: number; beatIndex: number; beat: TabBeat }> = [];
    for (let measureIndex = 0; measureIndex < measureCount; measureIndex += 1) {
      const beats = getBeatsFromMeasure(tabData.measures[measureIndex]);
      for (let beatIndex = 0; beatIndex < beats.length; beatIndex += 1) {
        sequence.push({ measureIndex, beatIndex, beat: beats[beatIndex] });
      }
    }
    return sequence;
  }, [measureCount, tabData.measures]);
  const selectedBeatSequenceIndex = useMemo(
    () =>
      selectedBeatId
        ? beatSequence.findIndex(
            ({ measureIndex, beatIndex }) => `${measureIndex}:${beatIndex}` === selectedBeatId,
          )
        : -1,
    [beatSequence, selectedBeatId],
  );

  const handleBeatClick = useCallback(
    (_beat: TabBeat, beatId: string) => {
      setIsPlaying(false);
      const [measurePart, beatPart] = beatId.split(':');
      const measureIdx = Number(measurePart);
      const beatIdx = Number(beatPart);
      if (Number.isNaN(measureIdx)) return;
      focusMeasureBeat(measureIdx, Number.isNaN(beatIdx) ? undefined : beatIdx);
    },
    [focusMeasureBeat],
  );

  const moveBeatSelection = useCallback(
    (direction: -1 | 1) => {
      if (beatSequence.length === 0) return;
      setIsPlaying(false);

      let nextIndex = -1;
      if (selectedBeatSequenceIndex >= 0) {
        nextIndex = selectedBeatSequenceIndex + direction;
      } else {
        const firstAtOrAfterPlayhead = beatSequence.findIndex(
          ({ measureIndex }) => measureIndex >= playheadMeasureIndex,
        );
        if (direction > 0) {
          nextIndex = firstAtOrAfterPlayhead >= 0 ? firstAtOrAfterPlayhead : 0;
        } else {
          nextIndex = firstAtOrAfterPlayhead > 0 ? firstAtOrAfterPlayhead - 1 : beatSequence.length - 1;
        }
      }

      if (nextIndex < 0 || nextIndex >= beatSequence.length) return;
      const next = beatSequence[nextIndex];
      focusMeasureBeat(next.measureIndex, next.beatIndex);
    },
    [beatSequence, focusMeasureBeat, playheadMeasureIndex, selectedBeatSequenceIndex],
  );

  const moveMeasureSelection = useCallback(
    (direction: -1 | 1) => {
      if (measureCount === 0) return;
      setIsPlaying(false);

      let sourceMeasureIndex = playheadMeasureIndex;
      let sourceBeatIndex = 0;
      if (selectedBeatId) {
        const [measurePart, beatPart] = selectedBeatId.split(':');
        const parsedMeasure = Number(measurePart);
        const parsedBeat = Number(beatPart);
        if (!Number.isNaN(parsedMeasure)) sourceMeasureIndex = parsedMeasure;
        if (!Number.isNaN(parsedBeat)) sourceBeatIndex = parsedBeat;
      }

      const targetMeasureIndex = Math.max(
        0,
        Math.min(measureCount - 1, sourceMeasureIndex + direction),
      );
      if (targetMeasureIndex === sourceMeasureIndex) return;

      const targetBeats = getBeatsFromMeasure(tabData.measures[targetMeasureIndex]);

      if (targetBeats.length === 0) {
        setPlayheadMeasureIndex(targetMeasureIndex);
        setSelectedBeatId(null);
        setHighlightedNotes([]);
        return;
      }

      const targetBeatIndex = Math.min(sourceBeatIndex, targetBeats.length - 1);
      focusMeasureBeat(targetMeasureIndex, targetBeatIndex);
    },
    [focusMeasureBeat, measureCount, playheadMeasureIndex, selectedBeatId, setHighlightedNotes, setPlayheadMeasureIndex, setSelectedBeatId, tabData.measures],
  );

  const stepToPrevMeasure = useCallback(() => {
    setIsPlaying(false);
    setSelectedBeatId(null);
    setPlayheadMeasureIndex(Math.max(0, playheadMeasureIndex - 1));
  }, [playheadMeasureIndex, setPlayheadMeasureIndex, setSelectedBeatId]);

  const stepToNextMeasure = useCallback(() => {
    setIsPlaying(false);
    setSelectedBeatId(null);
    setPlayheadMeasureIndex(Math.min(Math.max(0, measureCount - 1), playheadMeasureIndex + 1));
  }, [measureCount, playheadMeasureIndex, setPlayheadMeasureIndex, setSelectedBeatId]);

  const togglePlayback = useCallback(() => {
    if (measureCount === 0) return;
    setSelectedBeatId(null);
    setIsPlaying((current) => {
      if (current) return false;
      if (playheadMeasureIndex >= measureCount - 1) {
        setPlayheadMeasureIndex(0);
      }
      return true;
    });
  }, [measureCount, playheadMeasureIndex]);

  useEffect(() => {
    setPlayheadMeasureIndex(0);
    setSelectedBeatId(null);
    setIsPlaying(false);
    setFocusFretboardMode(true);
  }, [setPlayheadMeasureIndex, setSelectedBeatId, tabData.measures]);

  useEffect(() => {
    if (!measureCount) return;
    if (selectedBeatId) return;

    const currentMeasure = tabData.measures[playheadMeasureIndex];
    const beats = getBeatsFromMeasure(currentMeasure);
    const firstPlayableBeat = beats.find((beat) =>
      (beat.notes ?? []).some((note) => !note.rest && !note.dead),
    );

    if (firstPlayableBeat) {
      setHighlightedNotes(toHighlightedNotes(firstPlayableBeat));
    } else {
      setHighlightedNotes([]);
    }
  }, [playheadMeasureIndex, measureCount, selectedBeatId, setHighlightedNotes, tabData.measures]);

  useEffect(() => {
    if (!isPlaying || measureCount === 0) return;
    if (playheadMeasureIndex >= measureCount - 1) {
      setIsPlaying(false);
      return;
    }

    const beatsInMeasure = getBeatsPerMeasure(tabData.measures[playheadMeasureIndex]);
    const measureMs = Math.max(1, beatsInMeasure) * (60 / effectiveBpm) * 1000;
    const timer = window.setTimeout(() => {
      setPlayheadMeasureIndex(Math.min(measureCount - 1, playheadMeasureIndex + 1));
      setSelectedBeatId(null);
    }, measureMs);

    return () => window.clearTimeout(timer);
  }, [effectiveBpm, isPlaying, measureCount, playheadMeasureIndex, setPlayheadMeasureIndex, setSelectedBeatId, tabData.measures]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target) {
        const tagName = target.tagName;
        if (
          target.isContentEditable ||
          tagName === 'INPUT' ||
          tagName === 'TEXTAREA' ||
          tagName === 'SELECT'
        ) {
          return;
        }
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        moveBeatSelection(-1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        moveBeatSelection(1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveMeasureSelection(-1);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveMeasureSelection(1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [moveBeatSelection, moveMeasureSelection]);

  useEffect(() => {
    if (!measureCount) return;
    const measureEl = document.querySelector(`[data-measure-index="${playheadMeasureIndex}"]`);
    if (measureEl instanceof HTMLElement) {
      measureEl.scrollIntoView({
        behavior: isPlaying ? 'smooth' : 'auto',
        block: 'nearest',
        inline: 'center',
      });
    }
  }, [isPlaying, measureCount, playheadMeasureIndex]);

  useEffect(() => {
    return () => {
      setHighlightedNotes([]);
    };
  }, [setHighlightedNotes]);

  if (!tabData.measures?.length) {
    return (
      <div
        className="rounded-xl border p-4 text-sm"
        style={{
          borderColor: 'var(--border-primary)',
          backgroundColor: 'var(--card-bg)',
          color: 'var(--text-muted)',
        }}
      >
        No tab measures found for this track.
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-1">
        <div>
          <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            {tabData.name || 'Tab Viewer'}
          </h3>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Click any beat to highlight those notes on the fretboard. Use ←/→ for beats and ↑/↓ for measures.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs md:text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            {bpm ? `BPM ${bpm}` : 'BPM N/A'} • {tabData.measures.length} measures
          </div>
          <div
            className="flex items-center gap-1 rounded-full border px-2 py-1"
            style={{
              borderColor: 'var(--border-primary)',
              backgroundColor: 'var(--bg-secondary)',
            }}
          >
            <button
              type="button"
              onClick={stepToPrevMeasure}
              disabled={playheadMeasureIndex <= 0}
              className="h-7 w-7 rounded-full text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                backgroundColor: 'var(--card-bg)',
                color: 'var(--text-secondary)',
              }}
              title="Previous measure"
            >
              ◀
            </button>
            <button
              type="button"
              onClick={togglePlayback}
              className="h-8 min-w-16 px-2 rounded-full text-xs font-semibold"
              style={{
                backgroundColor: isPlaying ? 'var(--accent-600)' : 'var(--accent-500)',
                color: 'white',
              }}
              title={isPlaying ? 'Pause playback' : 'Play from current measure'}
            >
              {isPlaying ? 'Pause' : 'Play'}
            </button>
            <button
              type="button"
              onClick={stepToNextMeasure}
              disabled={playheadMeasureIndex >= Math.max(0, measureCount - 1)}
              className="h-7 w-7 rounded-full text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                backgroundColor: 'var(--card-bg)',
                color: 'var(--text-secondary)',
              }}
              title="Next measure"
            >
              ▶
            </button>
          </div>
          <button
            type="button"
            onClick={() => setFocusFretboardMode((current) => !current)}
            className="h-8 px-3 rounded-full text-xs font-semibold border"
            style={{
              borderColor: focusFretboardMode ? 'var(--accent-600)' : 'var(--border-primary)',
              color: focusFretboardMode ? 'var(--accent-500)' : 'var(--text-secondary)',
              backgroundColor: focusFretboardMode ? 'rgba(16,185,129,0.1)' : 'var(--card-bg)',
            }}
            title="Toggle compact measure strip and focus on fretboard"
          >
            {focusFretboardMode ? 'Fret Focus On' : 'Fret Focus Off'}
          </button>
          <div className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
            M{Math.min(playheadMeasureIndex + 1, Math.max(1, measureCount))}
          </div>
        </div>
      </div>

      <div className={focusFretboardMode ? 'space-y-3' : 'space-y-6'}>
        {measureRows.map((row, rowIndex) => {
          const rowMarker = row.measures.find((m) => m.marker?.text)?.marker?.text;
          return (
            <div key={rowIndex} className="space-y-2">
              {rowMarker && (
                <div>
                  <span
                    className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold border"
                    style={{
                      borderColor: 'var(--accent-600)',
                      color: 'var(--accent-600)',
                      backgroundColor: 'rgba(16,185,129,0.1)',
                    }}
                  >
                    {rowMarker}
                  </span>
                </div>
              )}
              <MeasureGroup
                measures={row.measures}
                startMeasureIndex={row.startMeasureIndex}
                selectedBeatId={selectedBeatId}
                activeMeasureIndex={playheadMeasureIndex}
                compact={focusFretboardMode}
                showLeftBackSlice={focusFretboardMode}
                canStepPrev={playheadMeasureIndex > 0}
                onStepPrev={stepToPrevMeasure}
                onBeatClick={handleBeatClick}
                tuningNotes={tuningNotes}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
