import { ScaleSelector } from '../ScaleSelector/ScaleSelector';
import { ChordSelector } from '../ChordSelector/ChordSelector';
import { DiatonicChordsRow } from '../DiatonicChordsRow/DiatonicChordsRow';
import { PlayTextButton } from '../PlayButton';
import { playChord, getChordDuration } from '../../utils/audio';
import { useAppStore } from '../../stores';
import type { DiatonicChord } from '../../types';

interface ControlBarProps {
  onScaleSelect: (root: string, mode: string) => void;
  onDiatonicChordClick: (chord: DiatonicChord) => void;
  onDirectChordSelect: (root: string, quality: string) => void;
  onClearAll: () => void;
}

export function ControlBar({
  onScaleSelect,
  onDiatonicChordClick,
  onDirectChordSelect,
  onClearAll,
}: ControlBarProps) {
  const {
    appMode,
    darkMode,
    // Scale state
    selectedRoot,
    selectedMode,
    scaleData,
    selectedDiatonicChord,
    // Chord state
    selectedChordRoot,
    selectedChordQuality,
    chordData,
    activeChordShapes,
  } = useAppStore();

  const showClearButton = scaleData || chordData;
  const showPlayButton = appMode === 'chord' && chordData && activeChordShapes.length > 0;

  const handlePlayChord = () => {
    if (!chordData) return;
    const activeShape = chordData.caged_shapes.find((s) =>
      activeChordShapes.includes(s.shape)
    );
    if (activeShape) {
      const positions = activeShape.positions.map((p) => ({
        string: p.string,
        fret: p.fret,
      }));
      playChord(positions);
    }
  };

  return (
    <section className="px-3 md:px-6 pt-3 md:pt-6 pb-2 z-10 flex-shrink-0">
      <div
        className="flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-0 px-3 md:px-6 py-3 md:py-4 rounded-xl border"
        style={{
          backgroundColor: 'var(--card-bg)',
          borderColor: 'var(--border-primary)',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        <div className="flex flex-wrap items-center gap-3 md:gap-6">
          {/* Scale Mode Controls */}
          {appMode === 'scale' && (
            <>
              <ScaleSelector
                selectedRoot={selectedRoot}
                selectedMode={selectedMode}
                onSelect={onScaleSelect}
                darkMode={darkMode}
              />

              {/* Diatonic Chords */}
              {scaleData && (
                <>
                  <div
                    className="hidden md:block h-10 w-px"
                    style={{ backgroundColor: 'var(--border-primary)' }}
                  />
                  <div className="w-full md:w-auto overflow-x-auto md:overflow-x-visible -mx-3 px-3 md:mx-0 md:px-0">
                    <DiatonicChordsRow
                      chords={scaleData.diatonic_chords}
                      onChordClick={onDiatonicChordClick}
                      selectedChord={selectedDiatonicChord}
                      darkMode={darkMode}
                    />
                  </div>
                </>
              )}
            </>
          )}

          {/* Chord Mode Controls */}
          {appMode === 'chord' && (
            <ChordSelector
              selectedRoot={selectedChordRoot}
              selectedQuality={selectedChordQuality}
              onSelect={onDirectChordSelect}
              darkMode={darkMode}
            />
          )}
        </div>

        {/* Right side actions */}
        <div className="flex items-center gap-2 md:gap-3">
          {showPlayButton && (
            <PlayTextButton
              onClick={handlePlayChord}
              duration={getChordDuration(5) * 1000}
              label="Play Chord"
            />
          )}
          {showClearButton && (
            <button
              onClick={onClearAll}
              className="px-3 md:px-4 py-2 rounded-lg text-xs md:text-sm font-medium transition-all border touch-target"
              style={{
                backgroundColor: 'var(--card-bg)',
                borderColor: 'var(--border-primary)',
                color: 'var(--text-secondary)',
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
