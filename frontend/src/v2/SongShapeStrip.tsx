import type { SongShapeEvent, SongShapeSource } from '../types/v2';
import { PhysicalChordDiagram } from './PhysicalChordDiagram';

function sourceLabel(sources: SongShapeSource[]): string {
  const first = sources[0];
  if (sources.length === 1) return `M${first.measure_index + 1} · beat ${first.beat_index + 1}`;
  return `M${first.measure_index + 1} · beat ${first.beat_index + 1} · ×${sources.length}`;
}

export function SongShapeStrip({
  events,
  selectedMeasureIndex,
  selectedBeatIndex,
  tuningAvailable,
  onSelect,
  minimized,
  onToggleMinimized,
}: {
  events: SongShapeEvent[];
  selectedMeasureIndex?: number;
  selectedBeatIndex?: number;
  tuningAvailable: boolean;
  onSelect: (source: SongShapeSource) => void;
  // Diagrams default to minimized (compact cards) — the active shape's
  // diagram surfaces next to the fretboard instead (see SongStudyWorkspace),
  // so nothing is lost, the strip is just a lighter-weight picker.
  minimized: boolean;
  onToggleMinimized: () => void;
}) {
  return (
    <section data-testid="song-shape-strip" aria-labelledby="song-shape-strip-title" className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 id="song-shape-strip-title" className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
            Shapes in this passage
          </h4>
          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            Ordered from raw tab · immediate repeats collapse
          </p>
        </div>
        {events.length > 0 && (
          <button
            type="button"
            data-testid="song-shape-strip-toggle-diagrams"
            aria-expanded={!minimized}
            onClick={onToggleMinimized}
            className="shrink-0 rounded-md border px-2 py-1 text-[10px] font-semibold"
            style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}
          >
            {minimized ? 'Show diagrams' : 'Hide diagrams'}
          </button>
        )}
      </div>

      {events.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Physical chord shapes">
          {events.map((event, index) => {
            const source = event.sources[0];
            const selected = event.sources.some(
              (item) => item.measure_index === selectedMeasureIndex && item.beat_index === selectedBeatIndex,
            );
            const label = event.label ?? `Unknown shape ${index + 1}`;
            return (
              <button
                key={`${source.measure_index}:${source.beat_index}`}
                type="button"
                data-testid="song-shape-card"
                aria-pressed={selected}
                aria-label={`${label}, measure ${source.measure_index + 1}, beat ${source.beat_index + 1}${event.sources.length > 1 ? `, repeated ${event.sources.length} times` : ''}`}
                onClick={() => onSelect(source)}
                className={`flex flex-shrink-0 flex-col items-center gap-1 rounded-lg border p-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 ${minimized ? 'min-w-20' : 'min-w-32'}`}
                style={{
                  backgroundColor: selected ? 'var(--bg-hover)' : 'var(--card-bg)',
                  borderColor: selected ? 'var(--accent-500)' : 'var(--border-primary)',
                  color: 'var(--text-primary)',
                }}
              >
                <span className="w-full text-xs font-bold">{label}</span>
                <span className="w-full text-[9px]" style={{ color: 'var(--text-muted)' }}>
                  {sourceLabel(event.sources)} · exact
                </span>
                {!minimized && (
                  <PhysicalChordDiagram
                    positions={event.positions}
                    tuning={event.tuning}
                    label={event.label ?? undefined}
                  />
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <p role="status" className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {tuningAvailable
            ? 'No chord-like events in this passage. Single notes are shown in the tab and fretboard.'
            : 'Shape diagrams are unavailable because this track has no tuning data.'}
        </p>
      )}
      <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
        Exact strings and frets shown. ChordPro-only harmony remains text, not performed fingering.
      </p>
    </section>
  );
}
