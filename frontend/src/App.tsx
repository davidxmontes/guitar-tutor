import { useEffect, useMemo, useCallback, useState } from 'react';
import { Fretboard } from './components/Fretboard';
import { ChordDiagramRow } from './components/ChordDiagram';
import { ChordPopup } from './components/ChordPopup';
import { SongSearch } from './components/SongSearch';
import { TabViewer } from './components/TabViewer';
import { ChordProView } from './components/ChordProView';
import { Header, ChatSidebar, MobileChatSheet, ControlBar } from './components/layout';
import { useFretboard } from './hooks';
import { useAppStore } from './stores';
import { apiClient } from './api/client';
import type { DiatonicChord } from './types';
import type { AgentAction, FretboardHighlightAction } from './types/chat';

function App() {
  const [agentHighlightKeyScopeActive, setAgentHighlightKeyScopeActive] = useState(false);

  // ============================================================================
  // Zustand Store - only what App.tsx needs directly
  // ============================================================================
  const {
    darkMode,
    appMode,
    setAppMode,
    displayMode,
    showScaleInChordMode,
    diagramsExpanded,
    setDiagramsExpanded,
    popupState,
    setPopupState,
    scaleData,
    selectedRoot,
    selectedMode,
    selectedDiatonicChord,
    setSelectedDiatonicChord,
    fetchScale,
    clearScale,
    resetScale,
    chordData,
    activeVoicings,
    setActiveVoicings,
    toggleVoicing,
    fetchChord,
    clearChord,
    resetChord,
    setChordData,
    sendMessage,
    messages,
    selectedSong,
    tabData,
    tabLoading,
    tabError,
    chordProData,
    chordProLoading,
    songViewMode,
    highlightedNotes,
    searchSongs,
    selectSongById,
    selectTrack,
    focusMeasureBeat,
    setSongViewMode,
    selectedTuning,
    customTuningNotes,
    fetchTunings,
    agentHighlightGroups,
    agentHighlightIndex,
    agentHighlightVisible,
    setAgentHighlights,
    clearAgentHighlights,
    nextAgentHighlight,
    prevAgentHighlight,
  } = useAppStore();

  // ============================================================================
  // Fretboard data (still uses hook for API fetch with loading/error)
  // ============================================================================
  const tuningNotes = customTuningNotes?.join(',');
  const { fretboardData, loading, error } = useFretboard(selectedTuning, tuningNotes);

  // ============================================================================
  // Apply dark mode class on mount and sync with localStorage
  // ============================================================================
  useEffect(() => {
    const html = document.documentElement;
    if (darkMode) {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }
  }, [darkMode]);

  // ============================================================================
  // Fetch available tunings on mount
  // ============================================================================
  useEffect(() => { fetchTunings(); }, [fetchTunings]);

  useEffect(() => {
    const updateScope = (target: EventTarget | null) => {
      if (!(target instanceof Element)) {
        setAgentHighlightKeyScopeActive(false);
        return;
      }
      setAgentHighlightKeyScopeActive(!!target.closest('[data-agent-highlight-scope="chat"]'));
    };

    const handlePointerDown = (event: PointerEvent) => updateScope(event.target);
    const handleFocusIn = (event: FocusEvent) => updateScope(event.target);

    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('focusin', handleFocusIn);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('focusin', handleFocusIn);
    };
  }, []);

  // Rehydrate the latest assistant fretboard highlight from persisted chat history
  // after a full page refresh. This keeps the overlay controls in chat aligned
  // with the visible assistant message without replaying all agent actions.
  useEffect(() => {
    const latestHighlightMessage = [...messages].reverse().find((message) =>
      message.role === 'assistant'
      && message.actions?.some(
        (action): action is FretboardHighlightAction =>
          action.type === 'fretboard.highlight' && action.groups.length > 0,
      ),
    );

    if (!latestHighlightMessage) {
      clearAgentHighlights();
      return;
    }

    const highlightAction = latestHighlightMessage.actions?.find(
      (action): action is FretboardHighlightAction =>
        action.type === 'fretboard.highlight' && action.groups.length > 0,
    );

    if (highlightAction) {
      setAgentHighlights(highlightAction.groups, latestHighlightMessage.id);
    }
    // Intentionally mount-only: we want refresh rehydration, but we should not
    // re-enable highlights after the user explicitly clears or hides them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ============================================================================
  // Auto-fetch scale when in scale mode (re-fetches on tuning change)
  // ============================================================================
  useEffect(() => {
    if (appMode === 'scale') {
      fetchScale(selectedRoot, selectedMode);
    }
  }, [appMode, selectedRoot, selectedMode, selectedTuning, customTuningNotes, fetchScale]);

  // ============================================================================
  // Re-fetch chord when tuning changes
  // ============================================================================
  useEffect(() => {
    const { selectedChordRoot, selectedChordQuality } = useAppStore.getState();
    if (appMode === 'chord' && selectedChordRoot && selectedChordQuality) {
      fetchChord(selectedChordRoot, selectedChordQuality);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTuning, customTuningNotes]);

  // ============================================================================
  // Computed Values
  // ============================================================================
  
  // Map scale notes to their diatonic chords
  const noteToChordMap = useMemo(() => {
    if (!scaleData) return new Map<string, DiatonicChord>();
    const map = new Map<string, DiatonicChord>();
    scaleData.diatonic_chords.forEach((chord) => {
      map.set(chord.root, chord);
    });
    return map;
  }, [scaleData]);

  // Compute clickable notes (all scale notes in scale mode)
  const clickableScaleNotes = useMemo(() => {
    if (appMode !== 'scale' || !scaleData) return undefined;
    return new Set(scaleData.scale_notes);
  }, [appMode, scaleData]);

  // Determine which chord data to show on fretboard (suppress when agent highlights are active)
  const fretboardChordData = (appMode === 'song' || agentHighlightVisible) ? null : chordData;
  const fretboardScalePositions = (appMode === 'scale' || (appMode === 'chord' && showScaleInChordMode))
    ? (scaleData?.positions ?? [])
    : [];

  // ============================================================================
  // Event Handlers
  // ============================================================================

  // Handle scale selection
  const handleScaleSelect = useCallback((root: string, mode: string) => {
    fetchScale(root, mode);
  }, [fetchScale]);

  // Handle diatonic chord click
  const handleDiatonicChordClick = useCallback(async (diatonicChord: DiatonicChord) => {
    // Check if we're clicking the same chord to deselect
    if (selectedDiatonicChord?.numeral === diatonicChord.numeral) {
      setSelectedDiatonicChord(null);
      setChordData(null);
      setActiveVoicings([]);
      return;
    }

    // Selecting new chord
    setSelectedDiatonicChord(diatonicChord);
    const data = await fetchChord(diatonicChord.root, diatonicChord.quality);
    if (data) {
      setActiveVoicings([]);
    }
  }, [selectedDiatonicChord, setSelectedDiatonicChord, fetchChord, setChordData, setActiveVoicings]);

  // Handle direct chord select (chord mode)
  const handleDirectChordSelect = useCallback(async (root: string, quality: string) => {
    await fetchChord(root, quality);
  }, [fetchChord]);

  // Handle click on any scale note (opens popup)
  // Note: We use apiClient directly here to avoid updating the global chordData store
  // The fretboard should continue showing the scale, not switch to the chord
  const handleScaleNoteClick = useCallback(async (
    e: React.MouseEvent,
    note: string,
    _string: number,
    fret: number
  ) => {
    if (appMode !== 'scale' || !scaleData) return;

    const diatonicChord = noteToChordMap.get(note);
    if (!diatonicChord) return;

    try {
      // Fetch chord data directly without updating the store
      const { selectedTuning: t, customTuningNotes: cn } = useAppStore.getState();
      const data = await apiClient.getChord(diatonicChord.root, diatonicChord.quality, t, cn?.join(','));
      setPopupState({
        chordData: data,
        position: { x: e.clientX, y: e.clientY },
        clickedFret: fret,
      });
    } catch (err) {
      console.error('Failed to fetch chord for popup:', err);
    }
  }, [appMode, scaleData, noteToChordMap, setPopupState]);

  // Close popup
  const handleClosePopup = useCallback(() => {
    setPopupState(null);
  }, [setPopupState]);

  // Clear all selections
  const handleClearAll = useCallback(() => {
    clearScale();
    clearChord();
    resetScale();
    resetChord();
    clearAgentHighlights();
  }, [clearScale, clearChord, resetScale, resetChord, clearAgentHighlights]);

  // Handle chat chord click
  const handleChatChordClick = useCallback(async (
    chordName: string,
    apiRequest?: { root: string; quality: string }
  ) => {
    let root: string;
    let quality: string;

    if (apiRequest) {
      root = apiRequest.root;
      quality = apiRequest.quality;
    } else {
      const parts = chordName.trim().split(/\s+/);
      if (parts.length < 2) return;
      root = parts[0];
      quality = parts.slice(1).join('_').toLowerCase();
    }

    setAppMode('chord');
    await fetchChord(root, quality);
  }, [setAppMode, fetchChord]);

  // Handle chat scale click
  const handleChatScaleClick = useCallback(async (
    scaleName: string,
    apiRequest?: { root: string; mode: string }
  ) => {
    let root: string;
    let mode: string;

    if (apiRequest) {
      root = apiRequest.root;
      mode = apiRequest.mode;
    } else {
      const parts = scaleName.trim().split(/\s+/);
      if (parts.length < 2) return;
      root = parts[0];
      mode = parts.slice(1).join('_').toLowerCase();
    }

    setAppMode('scale');
    fetchScale(root, mode);
  }, [setAppMode, fetchScale]);

  // Derive active agent highlight group for fretboard (only when visible)
  const agentHighlightGroup = agentHighlightVisible && agentHighlightGroups
    ? agentHighlightGroups[agentHighlightIndex] ?? null
    : null;

  useEffect(() => {
    if (
      !agentHighlightKeyScopeActive ||
      !agentHighlightVisible ||
      !agentHighlightGroups ||
      agentHighlightGroups.length <= 1
    ) {
      return;
    }

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

      // In song mode, TabViewer already owns arrow-key navigation.
      if (appMode === 'song') return;

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        prevAgentHighlight();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        nextAgentHighlight();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    agentHighlightGroups,
    agentHighlightKeyScopeActive,
    agentHighlightVisible,
    appMode,
    nextAgentHighlight,
    prevAgentHighlight,
  ]);

  // Handle chat send with visualization
  const executeAgentActions = useCallback(async (actions: AgentAction[], messageId?: string) => {
    const currentMode = useAppStore.getState().appMode;

    for (const action of actions) {
      try {
        if (action.type === 'theory.show_chord') {
          // In song mode, skip auto-switching — let the user click pills instead
          if (currentMode === 'song') continue;
          await handleChatChordClick(`${action.root} ${action.quality}`, {
            root: action.root,
            quality: action.quality,
          });
          continue;
        }
        if (action.type === 'theory.show_scale') {
          if (currentMode === 'song') continue;
          await handleChatScaleClick(`${action.root} ${action.mode}`, {
            root: action.root,
            mode: action.mode,
          });
          continue;
        }
        if (action.type === 'song.search') {
          setAppMode('song');
          await searchSongs(action.query);
          continue;
        }
        if (action.type === 'song.select') {
          setAppMode('song');
          await selectSongById(action.song_id);
          continue;
        }
        if (action.type === 'song.track.select') {
          setAppMode('song');
          await selectTrack(action.track_index);
          continue;
        }
        if (action.type === 'song.measure.focus') {
          setAppMode('song');
          setSongViewMode('tab');
          focusMeasureBeat(action.measure_index, action.beat_index);
          continue;
        }
        if (action.type === 'fretboard.highlight') {
          if (messageId) setAgentHighlights(action.groups, messageId);
          continue;
        }
        console.warn('Unknown agent action type:', action);
      } catch (err) {
        console.error('Failed to execute agent action:', action, err);
      }
    }
  }, [
    focusMeasureBeat,
    handleChatChordClick,
    handleChatScaleClick,
    searchSongs,
    selectSongById,
    selectTrack,
    setAgentHighlights,
    setAppMode,
    setSongViewMode,
  ]);

  const handleChatSend = useCallback(async (message: string) => {
    const response = await sendMessage(message);

    if (response?.actions?.length) {
      await executeAgentActions(response.actions, response.id);
      return;
    }

    // Backward compatibility fallback for older responses with no actions[]
    if (response?.visualizations && response.apiRequests?.chords?.length) {
      const firstChordRequest = response.apiRequests.chords[0];
      if (response.chordChoices?.[0]) {
        await handleChatChordClick(response.chordChoices[0], firstChordRequest);
      }
    }
  }, [sendMessage, executeAgentActions, handleChatChordClick]);

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      {/* Header - now uses Zustand directly, no props needed */}
      <Header />

      {/* Main Layout: Chat Sidebar + Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat Sidebar (Desktop) - uses Zustand for state, only needs action handlers */}
        <ChatSidebar
          onSendMessage={handleChatSend}
          onChordClick={handleChatChordClick}
          onScaleClick={handleChatScaleClick}
        />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--main-content-bg)' }}>
          {/* Control Bar - hide empty song panel before a song is selected */}
          {!(appMode === 'song' && !selectedSong) && (
            <ControlBar
              onScaleSelect={handleScaleSelect}
              onDiatonicChordClick={handleDiatonicChordClick}
              onDirectChordSelect={handleDirectChordSelect}
              onClearAll={handleClearAll}
            />
          )}

          {/* Scrollable Content */}
          <main className="flex-1 overflow-y-auto p-3 md:p-6 space-y-4 pb-20 md:pb-6" style={{ backgroundColor: 'var(--main-content-bg)' }}>
            {/* Song mode content */}
            {appMode === 'song' && !selectedSong && (
              <SongSearch />
            )}

            {appMode === 'song' && selectedSong && (
              <>
                {songViewMode === 'tab' ? (
                  <>
                    {tabLoading && (
                      <div className="flex items-center justify-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>
                        Loading tab...
                      </div>
                    )}
                    {!tabLoading && tabError && (
                      <div
                        className="rounded-lg p-4 border text-sm"
                        style={{
                          borderColor: '#b91c1c',
                          backgroundColor: 'rgba(239,68,68,0.1)',
                          color: '#b91c1c',
                        }}
                      >
                        {tabError}
                      </div>
                    )}
                    {!tabLoading && !tabError && tabData && (
                      <TabViewer tabData={tabData.tab_data} tuningNotes={fretboardData?.tuning_notes} />
                    )}
                  </>
                ) : (
                  <>
                    {chordProLoading && (
                      <div className="flex items-center justify-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>
                        Loading chords...
                      </div>
                    )}
                    {!chordProLoading && chordProData && (
                      <ChordProView chordpro={chordProData.chordpro} />
                    )}
                    {!chordProLoading && !chordProData && (
                      <div
                        className="rounded-lg p-4 border text-sm"
                        style={{
                          borderColor: 'var(--border-primary)',
                          backgroundColor: 'var(--card-bg)',
                          color: 'var(--text-muted)',
                        }}
                      >
                        No chord data available for this song.
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {/* Chord Diagrams */}
            {appMode !== 'song' && fretboardChordData && (
              <ChordDiagramRow
                voicings={fretboardChordData.voicings}
                activeVoicings={activeVoicings}
                onToggleVoicing={toggleVoicing}
                isExpanded={diagramsExpanded}
                onToggleExpanded={() => setDiagramsExpanded(!diagramsExpanded)}
              />
            )}

            {/* Loading State */}
            {loading && (
              <div className="flex items-center justify-center py-12">
                <div style={{ color: 'var(--text-muted)' }}>Loading fretboard...</div>
              </div>
            )}

            {/* Error State */}
            {error && (
              <div
                className="rounded-lg p-4 mb-4 border"
                style={{
                  backgroundColor: darkMode ? '#450a0a' : '#fef2f2',
                  borderColor: darkMode ? '#7f1d1d' : '#fecaca',
                }}
              >
                <p style={{ color: darkMode ? '#fca5a5' : '#b91c1c' }}>{error}</p>
                <p className="text-sm mt-1" style={{ color: darkMode ? '#f87171' : '#dc2626' }}>
                  Make sure the backend is running and reachable. This app calls the API at{' '}
                  <strong>{(import.meta.env as any).VITE_API_BASE_URL ?? '/api'}</strong>
                  {'. '}If you're running locally, the backend also listens on{' '}
                  <strong>http://localhost:8000</strong>.
                </p>
              </div>
            )}

            {/* Fretboard */}
            {fretboardData && (
              <Fretboard
                strings={fretboardData.strings}
                fretCount={fretboardData.fret_count}
                tuningNotes={fretboardData.tuning_notes}
                scalePositions={fretboardScalePositions}
                chordVoicings={fretboardChordData?.voicings}
                activeVoicings={activeVoicings}
                displayMode={displayMode}
                onScaleNoteClick={handleScaleNoteClick}
                clickableScaleNotes={clickableScaleNotes}
                darkMode={darkMode}
                highlightedNotes={appMode === 'song' ? highlightedNotes : []}
                agentHighlightGroup={agentHighlightGroup}
              />
            )}

            {/* Scale mode hint */}
            {appMode === 'scale' && scaleData && !fretboardChordData && (
              <div className="text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                Hint: Click on any scale note to see the chord built on that degree
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Chord Popup */}
      {popupState && (
        <ChordPopup
          chordData={popupState.chordData}
          position={popupState.position}
          clickedFret={popupState.clickedFret}
          onClose={handleClosePopup}
        />
      )}

      {/* Mobile Chat - uses Zustand for state, only needs action handlers */}
      <MobileChatSheet
        onSendMessage={handleChatSend}
        onChordClick={handleChatChordClick}
        onScaleClick={handleChatScaleClick}
      />
    </div>
  );
}

export default App;
