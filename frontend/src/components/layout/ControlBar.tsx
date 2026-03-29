import { ScaleSelector } from '../ScaleSelector/ScaleSelector';
import { ChordSelector } from '../ChordSelector/ChordSelector';
import { DiatonicChordsRow } from '../DiatonicChordsRow/DiatonicChordsRow';
import { PlayTextButton } from '../PlayButton';
import { SongControls } from '../SongControls';
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
    activeVoicings,
    showScaleInChordMode,
    setShowScaleInChordMode,
  } = useAppStore();

  const showClearButton = scaleData || chordData;
  const showPlayButton = appMode === 'chord' && chordData && activeVoicings.length > 0;

  const handlePlayChord = () => {
    if (!chordData) return;
    const activeVoicing = chordData.voicings.find((s) =>
      activeVoicings.includes(s.label)
    );
    if (activeVoicing) {
      const positions = activeVoicing.positions.map((p) => ({
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
        {appMode === 'song' ? (
          <SongControls />
        ) : (
          <>
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
            <>
              <ChordSelector
                selectedRoot={selectedChordRoot}
                selectedQuality={selectedChordQuality}
                onSelect={onDirectChordSelect}
                darkMode={darkMode}
              />
              <div className="flex items-center gap-2">
                <span
                  className="text-xs md:text-sm"
                  style={{ color: scaleData ? 'var(--text-secondary)' : 'var(--text-muted)' }}
                >
                  Show Scale Overlay
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={showScaleInChordMode}
                  aria-label="Show Scale Overlay"
                  onClick={() => scaleData && setShowScaleInChordMode(!showScaleInChordMode)}
                  disabled={!scaleData}
                  className={`
                    relative inline-flex h-6 w-11 items-center rounded-full border transition-colors
                    ${showScaleInChordMode ? '' : ''}
                    ${scaleData ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}
                  `}
                  style={{
                    backgroundColor: showScaleInChordMode ? 'var(--accent-500)' : 'var(--bg-tertiary)',
                    borderColor: showScaleInChordMode ? 'var(--accent-600)' : 'var(--border-primary)',
                  }}
                >
                  <span
                    className={`
                      inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform
                      ${showScaleInChordMode ? 'translate-x-5' : 'translate-x-0.5'}
                    `}
                  />
                </button>
              </div>
            </>
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
          </>
        )}
      </div>
    </section>
  );
}
