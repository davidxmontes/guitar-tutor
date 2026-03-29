import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../../stores/useAppStore';
import type { HighlightedNote, TabBeat, TabData, TabMeasure } from '../../types';
import { MeasureGroup } from './MeasureGroup';

interface TabViewerProps {
  tabData: TabData;
  measuresPerRow?: number;
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

export function TabViewer({ tabData, measuresPerRow = 4 }: TabViewerProps) {
  const setHighlightedNotes = useAppStore((s) => s.setHighlightedNotes);
  const [selectedBeatId, setSelectedBeatId] = useState<string | null>(null);
  const [playheadMeasureIndex, setPlayheadMeasureIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const measureRows = useMemo(
    () => chunkMeasures(tabData.measures ?? [], Math.max(1, measuresPerRow)),
    [tabData.measures, measuresPerRow],
  );
  const bpm = tabData.automations?.tempo?.[0]?.bpm;
  const effectiveBpm = typeof bpm === 'number' && bpm > 0 ? bpm : 120;
  const measureCount = tabData.measures?.length ?? 0;

  const handleBeatClick = useCallback(
    (beat: TabBeat, beatId: string) => {
      setIsPlaying(false);
      setSelectedBeatId(beatId);
      setHighlightedNotes(toHighlightedNotes(beat));
      const measureIdx = Number(beatId.split(':')[0]);
      if (!Number.isNaN(measureIdx)) setPlayheadMeasureIndex(measureIdx);
    },
    [setHighlightedNotes],
  );

  const stepToPrevMeasure = useCallback(() => {
    setIsPlaying(false);
    setSelectedBeatId(null);
    setPlayheadMeasureIndex((idx) => Math.max(0, idx - 1));
  }, []);

  const stepToNextMeasure = useCallback(() => {
    setIsPlaying(false);
    setSelectedBeatId(null);
    setPlayheadMeasureIndex((idx) => Math.min(Math.max(0, measureCount - 1), idx + 1));
  }, [measureCount]);

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
  }, [tabData.measures]);

  useEffect(() => {
    if (!measureCount) return;
    const currentMeasure = tabData.measures[playheadMeasureIndex];
    const beats = getBeatsFromMeasure(currentMeasure);
    const firstPlayableBeat = beats.find((beat) =>
      (beat.notes ?? []).some((note) => !note.rest && !note.dead),
    );

    if (firstPlayableBeat) {
      setHighlightedNotes(toHighlightedNotes(firstPlayableBeat));
    } else if (!selectedBeatId) {
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
      setPlayheadMeasureIndex((idx) => Math.min(measureCount - 1, idx + 1));
      setSelectedBeatId(null);
    }, measureMs);

    return () => window.clearTimeout(timer);
  }, [effectiveBpm, isPlaying, measureCount, playheadMeasureIndex, tabData.measures]);

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
            Click any beat to highlight those notes on the fretboard.
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
          <div className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
            M{Math.min(playheadMeasureIndex + 1, Math.max(1, measureCount))}
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {measureRows.map((row, rowIndex) => {
          const rowMarker = row.find((m) => m.marker?.text)?.marker?.text;
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
                measures={row}
                startMeasureIndex={rowIndex * Math.max(1, measuresPerRow)}
                selectedBeatId={selectedBeatId}
                activeMeasureIndex={playheadMeasureIndex}
                onBeatClick={handleBeatClick}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
