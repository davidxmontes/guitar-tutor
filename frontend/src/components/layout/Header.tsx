import { useCallback } from 'react';
import headstockSrc from '../../assets/white_headstock.png';
import { useAppStore } from '../../stores';

export function Header() {
  const {
    appMode,
    setAppMode,
    displayMode,
    setDisplayMode,
    darkMode,
    toggleDarkMode,
    scaleData,
    chordData,
    clearChord,
    resetChord,
    fetchChord,
  } = useAppStore();

  const showDisplayToggle = scaleData || chordData;

  // Handle mode switch while preserving scale context for chord overlay rendering
  const handleModeSwitch = useCallback(async (mode: 'scale' | 'chord') => {
    setAppMode(mode);

    if (mode === 'chord') {
      clearChord();
      resetChord();
      // Auto-load C major chord when switching to chord mode
      await fetchChord('C', 'major');
      return;
    }
    // Scale mode: remove chord overlay; App.tsx useEffect will fetch if needed
    clearChord();
    resetChord();
  }, [setAppMode, clearChord, resetChord, fetchChord]);

  return (
    <header
      className="h-14 md:h-16 flex-shrink-0 z-20 border-b"
      style={{
        backgroundColor: 'var(--header-bg)',
        borderColor: 'var(--border-primary)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div className="h-full max-w-full mx-auto px-3 md:px-6 flex items-center justify-between">
        {/* Left side - Logo only */}
        <div className="flex items-center gap-2 md:gap-3">
          <div
            className="w-8 h-8 md:w-9 md:h-9 rounded-lg flex items-center justify-center text-white shadow-lg"
            style={{
              background: 'linear-gradient(to bottom right, var(--accent-600), var(--accent-700))',
              boxShadow: '0 10px 15px -3px var(--accent-glow)',
            }}
          >
            <img
              src={headstockSrc}
              alt="Guitar Tutor"
              className="w-8 h-8 md:w-9 md:h-9 rounded-lg object-cover"
            />
          </div>
          <h1
            className="text-base md:text-lg font-bold tracking-tight hidden sm:block"
            style={{ color: 'var(--text-primary)' }}
          >
            Guitar Tutor
          </h1>
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-2 md:gap-4">
          {/* Mode Toggle (Scale/Chord) */}
          <div
            className="flex rounded-lg p-0.5 md:p-1 border"
            style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-primary)' }}
          >
            <button
              onClick={() => handleModeSwitch('scale')}
              className={`px-2 md:px-4 py-1 md:py-1.5 rounded-md text-xs md:text-sm font-medium transition-all touch-target ${
                appMode === 'scale' ? 'shadow-sm border font-bold' : ''
              }`}
              style={{
                backgroundColor: appMode === 'scale' ? 'var(--card-bg)' : 'transparent',
                borderColor: appMode === 'scale' ? 'var(--border-primary)' : 'transparent',
                color: appMode === 'scale' ? 'var(--accent-600)' : 'var(--text-tertiary)',
              }}
            >
              <span className="hidden sm:inline">Scale Mode</span>
              <span className="sm:hidden">Scale</span>
            </button>
            <button
              onClick={() => handleModeSwitch('chord')}
              className={`px-2 md:px-4 py-1 md:py-1.5 rounded-md text-xs md:text-sm font-medium transition-all touch-target ${
                appMode === 'chord' ? 'shadow-sm border font-bold' : ''
              }`}
              style={{
                backgroundColor: appMode === 'chord' ? 'var(--card-bg)' : 'transparent',
                borderColor: appMode === 'chord' ? 'var(--border-primary)' : 'transparent',
                color: appMode === 'chord' ? 'var(--accent-600)' : 'var(--text-tertiary)',
              }}
            >
              <span className="hidden sm:inline">Chord Mode</span>
              <span className="sm:hidden">Chord</span>
            </button>
          </div>

          {/* Display Mode Toggle */}
          {showDisplayToggle && (
            <div
              className="flex items-center gap-1 md:gap-2 rounded-lg p-0.5 md:p-1 border"
              style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-primary)' }}
            >
              <span
                className="text-xs font-semibold px-1 md:px-2 uppercase tracking-wide hidden md:inline"
                style={{ color: 'var(--text-muted)' }}
              >
                Display:
              </span>
              <button
                onClick={() => setDisplayMode('notes')}
                className={`px-2 md:px-3 py-1 rounded text-xs font-medium transition-all touch-target ${
                  displayMode === 'notes' ? 'shadow-sm border font-bold' : ''
                }`}
                style={{
                  backgroundColor: displayMode === 'notes' ? 'var(--card-bg)' : 'transparent',
                  borderColor: displayMode === 'notes' ? 'var(--border-primary)' : 'transparent',
                  color: displayMode === 'notes' ? 'var(--accent-600)' : 'var(--text-tertiary)',
                }}
              >
                Notes
              </button>
              <button
                onClick={() => setDisplayMode('intervals')}
                className={`px-2 md:px-3 py-1 rounded text-xs font-medium transition-all touch-target ${
                  displayMode === 'intervals' ? 'shadow-sm border font-bold' : ''
                }`}
                style={{
                  backgroundColor: displayMode === 'intervals' ? 'var(--card-bg)' : 'transparent',
                  borderColor: displayMode === 'intervals' ? 'var(--border-primary)' : 'transparent',
                  color: displayMode === 'intervals' ? 'var(--accent-600)' : 'var(--text-tertiary)',
                }}
              >
                <span className="hidden sm:inline">Intervals</span>
                <span className="sm:hidden">Int</span>
              </button>
            </div>
          )}

          {/* Dark Mode Toggle */}
          <button
            onClick={toggleDarkMode}
            className="p-2 rounded-lg transition-all hover:scale-105 touch-target flex items-center justify-center"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-secondary)',
            }}
            title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {darkMode ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-5 h-5"
              >
                <path d="M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM18.894 6.166a.75.75 0 00-1.06-1.06l-1.591 1.59a.75.75 0 101.06 1.061l1.591-1.59zM21.75 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5H21a.75.75 0 01.75.75zM17.834 18.894a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 10-1.061 1.06l1.59 1.591zM12 18a.75.75 0 01.75.75V21a.75.75 0 01-1.5 0v-2.25A.75.75 0 0112 18zM7.758 17.303a.75.75 0 00-1.061-1.06l-1.591 1.59a.75.75 0 001.06 1.061l1.591-1.59zM6 12a.75.75 0 01-.75.75H3a.75.75 0 010-1.5h2.25A.75.75 0 016 12zM6.697 7.757a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 00-1.061 1.06l1.59 1.591z" />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-5 h-5"
              >
                <path
                  fillRule="evenodd"
                  d="M9.528 1.718a.75.75 0 01.162.819A8.97 8.97 0 009 6a9 9 0 009 9 8.97 8.97 0 003.463-.69.75.75 0 01.981.98 10.503 10.503 0 01-9.694 6.46c-5.799 0-10.5-4.701-10.5-10.5 0-4.368 2.667-8.112 6.46-9.694a.75.75 0 01.818.162z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
