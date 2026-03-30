import { ScaleSelector } from '../ScaleSelector/ScaleSelector';
import { ChordSelector } from '../ChordSelector/ChordSelector';
import { TuningSelector } from '../TuningSelector';
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
    // Tuning state
    selectedTuning,
    customTuningNotes,
    availableTunings,
    setSelectedTuning,
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
        className="w-full rounded-xl border px-3 py-3 md:px-6 md:py-4"
        style={{
          backgroundColor: 'var(--card-bg)',
          borderColor: 'var(--border-primary)',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        {appMode === 'song' ? (
          <SongControls />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 md:gap-4">
              <div className="flex flex-wrap items-end gap-3 md:gap-4 min-w-0">
                {availableTunings.length > 0 && (
                  <>
                    <TuningSelector
                      selectedTuning={selectedTuning}
                      tunings={availableTunings}
                      customTuningNotes={customTuningNotes}
                      onSelect={setSelectedTuning}
                    />
                    <div
                      className="hidden md:block h-10 w-px"
                      style={{ backgroundColor: 'var(--border-primary)' }}
                    />
                  </>
                )}

                {appMode === 'scale' && (
                  <ScaleSelector
                    selectedRoot={selectedRoot}
                    selectedMode={selectedMode}
                    onSelect={onScaleSelect}
                    darkMode={darkMode}
                  />
                )}

                {appMode === 'chord' && (
                  <>
                    <ChordSelector
                      selectedRoot={selectedChordRoot}
                      selectedQuality={selectedChordQuality}
                      onSelect={onDirectChordSelect}
                      darkMode={darkMode}
                    />
                    <div className="flex flex-col gap-1">
                      <span
                        className="text-[10px] md:text-xs font-semibold uppercase tracking-wide"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        Overlay
                      </span>
                      <div className="flex items-center gap-2 min-h-[42px]">
                        <span
                          className="text-xs md:text-sm whitespace-nowrap"
                          style={{ color: scaleData ? 'var(--text-secondary)' : 'var(--text-muted)' }}
                        >
                          Show Scale
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
                    </div>
                  </>
                )}
              </div>

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

            {appMode === 'scale' && scaleData && (
              <div className="border-t pt-4" style={{ borderColor: 'var(--border-primary)' }}>
                <div className="w-full overflow-x-auto md:overflow-x-visible">
                  <DiatonicChordsRow
                    chords={scaleData.diatonic_chords}
                    onChordClick={onDiatonicChordClick}
                    selectedChord={selectedDiatonicChord}
                    darkMode={darkMode}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
