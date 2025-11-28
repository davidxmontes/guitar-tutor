import { useEffect, useState, useMemo, useCallback } from 'react'
import { Fretboard } from './components/Fretboard'
import { ScaleSelector } from './components/ScaleSelector/ScaleSelector'
import { ChordSelector } from './components/ChordSelector/ChordSelector'
import { DiatonicChordsRow } from './components/DiatonicChordsRow/DiatonicChordsRow'
import { ChordDiagramRow } from './components/ChordDiagram'
import { ChordPopup } from './components/ChordPopup'
import { PlayTextButton } from './components/PlayButton'
import { ChatPanel } from './components/Chat'
import { playChord, getChordDuration } from './utils/audio'
import { apiClient } from './api/client'
import headstockSrc from './assets/white_headstock.png'
import type { FretboardResponse, ScaleResponse, ChordResponse, DiatonicChord, DisplayMode, CagedShapeName } from './types'
import type { ChatMessage } from './types/chat'

type AppMode = 'scale' | 'chord';

// Popup state type
interface PopupState {
  chordData: ChordResponse
  position: { x: number; y: number }
  clickedFret: number
}

function App() {
  const [appMode, setAppMode] = useState<AppMode>('scale')
  const [darkMode, setDarkMode] = useState(() => {
    // Check localStorage or system preference
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('darkMode')
      if (saved !== null) return saved === 'true'
      return window.matchMedia('(prefers-color-scheme: dark)').matches
    }
    return false
  })
  const [chatWidth, setChatWidth] = useState(320) // Default w-80 = 320px
  const [fretboardData, setFretboardData] = useState<FretboardResponse | null>(null)
  const [scaleData, setScaleData] = useState<ScaleResponse | null>(null)
  const [chordData, setChordData] = useState<ChordResponse | null>(null)
  const [selectedRoot, setSelectedRoot] = useState<string>('C')
  const [selectedMode, setSelectedMode] = useState<string>('major')
  const [selectedChordRoot, setSelectedChordRoot] = useState<string | null>(null)
  const [selectedChordQuality, setSelectedChordQuality] = useState<string | null>(null)
  const [selectedDiatonicChord, setSelectedDiatonicChord] = useState<DiatonicChord | null>(null)
  const [activeChordShapes, setActiveChordShapes] = useState<CagedShapeName[]>([])
  const [displayMode, setDisplayMode] = useState<DisplayMode>('notes')
  const [diagramsExpanded, setDiagramsExpanded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [popupState, setPopupState] = useState<PopupState | null>(null)
  
  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatLoading, setChatLoading] = useState(false)

  // Apply dark mode class to html element
  useEffect(() => {
    const html = document.documentElement
    if (darkMode) {
      html.classList.add('dark')
    } else {
      html.classList.remove('dark')
    }
    localStorage.setItem('darkMode', String(darkMode))
  }, [darkMode])

  // Toggle dark mode
  const toggleDarkMode = () => setDarkMode(prev => !prev)

  // Fetch fretboard data
  useEffect(() => {
    async function fetchFretboard() {
      try {
        setLoading(true)
        const data = await apiClient.getFretboard('standard')
        setFretboardData(data)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load fretboard')
        console.error('Failed to fetch fretboard:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchFretboard()
  }, [])

  // Auto-fetch scale when root or mode changes (scale mode only)
  useEffect(() => {
    if (appMode !== 'scale') return
    
    async function fetchScale() {
      try {
        const data = await apiClient.getScale(selectedRoot, selectedMode)
        setScaleData(data)
        // Clear chord data when changing scale
        setChordData(null)
        setSelectedDiatonicChord(null)
        setActiveChordShapes([])
      } catch (err) {
        console.error('Failed to fetch scale:', err)
        setError(err instanceof Error ? err.message : 'Failed to load scale')
      }
    }
    
    fetchScale()
  }, [appMode, selectedRoot, selectedMode])

  // Handle scale selection - just update state, useEffect will fetch
  const handleScaleSelect = (root: string, mode: string) => {
    setSelectedRoot(root)
    setSelectedMode(mode)
  }

  // Handle diatonic chord click
  const handleChordClick = async (chord: DiatonicChord) => {
    // If clicking the same chord, deselect it
    if (selectedDiatonicChord?.numeral === chord.numeral) {
      setSelectedDiatonicChord(null)
      setChordData(null)
      setActiveChordShapes([])
      return
    }

    try {
      const data = await apiClient.getChord(chord.root, chord.quality)
      setChordData(data)
      setSelectedDiatonicChord(chord)
      // Start with no shapes selected - user can click to select
      setActiveChordShapes([])
    } catch (err) {
      console.error('Failed to fetch chord:', err)
      setError(err instanceof Error ? err.message : 'Failed to load chord')
    }
  }

  // Handle direct chord selection (Chord Mode)
  const handleDirectChordSelect = async (root: string, quality: string) => {
    try {
      const data = await apiClient.getChord(root, quality)
      setChordData(data)
      setSelectedChordRoot(root)
      setSelectedChordQuality(quality)
      // Start with no shapes selected - user can click to select
      setActiveChordShapes([])
    } catch (err) {
      console.error('Failed to fetch chord:', err)
      setError(err instanceof Error ? err.message : 'Failed to load chord')
    }
  }

  // Switch app mode
  const handleModeSwitch = async (mode: AppMode) => {
    setAppMode(mode)
    // Clear data when switching modes
    setScaleData(null)
    setChordData(null)
    setSelectedRoot('C')
    setSelectedMode('major')
    setSelectedChordRoot(null)
    setSelectedChordQuality(null)
    setSelectedDiatonicChord(null)
    setActiveChordShapes([])
    
    // Auto-load C major chord when switching to chord mode
    if (mode === 'chord') {
      try {
        const data = await apiClient.getChord('C', 'major')
        setChordData(data)
        setSelectedChordRoot('C')
        setSelectedChordQuality('major')
        // Start with no shapes selected - user can click to select
        setActiveChordShapes([])
      } catch (err) {
        console.error('Failed to fetch default chord:', err)
      }
    } else {
      // Auto-load C major scale when switching to scale mode
      try {
        const data = await apiClient.getScale('C', 'major')
        setScaleData(data)
      } catch (err) {
        console.error('Failed to fetch default scale:', err)
      }
    }
  }

  // Toggle individual CAGED shape
  const handleToggleShape = (shape: CagedShapeName) => {
    if (activeChordShapes.includes(shape)) {
      // Allow deselecting even the last shape
      setActiveChordShapes(prev => prev.filter(s => s !== shape))
    } else {
      // Add the shape to active shapes
      setActiveChordShapes(prev => [...prev, shape])
    }
  }

  // Clear all selections
  const handleClearAll = () => {
    setScaleData(null)
    setChordData(null)
    setSelectedRoot('C')
    setSelectedMode('major')
    setSelectedChordRoot(null)
    setSelectedChordQuality(null)
    setSelectedDiatonicChord(null)
    setActiveChordShapes([])
  }

  // Compute clickable notes (all scale notes in scale mode)
  const clickableScaleNotes = useMemo(() => {
    if (appMode !== 'scale' || !scaleData) return undefined
    // All notes in the scale are clickable
    return new Set(scaleData.scale_notes)
  }, [appMode, scaleData])

  // Map scale notes to their diatonic chords
  const noteToChordMap = useMemo(() => {
    if (!scaleData) return new Map<string, DiatonicChord>()
    const map = new Map<string, DiatonicChord>()
    scaleData.diatonic_chords.forEach(chord => {
      map.set(chord.root, chord)
    })
    return map
  }, [scaleData])

  // Handle click on any scale note
  const handleScaleNoteClick = async (e: React.MouseEvent, note: string, _string: number, fret: number) => {
    if (appMode !== 'scale' || !scaleData) return
    
    // Find the diatonic chord for this note
    const chord = noteToChordMap.get(note)
    if (!chord) return
    
    try {
      const data = await apiClient.getChord(chord.root, chord.quality)
      setPopupState({
        chordData: data,
        position: { x: e.clientX, y: e.clientY },
        clickedFret: fret
      })
    } catch (err) {
      console.error('Failed to fetch chord for popup:', err)
    }
  }

  // Close popup
  const handleClosePopup = () => {
    setPopupState(null)
  }

  // Generate unique ID for chat messages
  const generateMessageId = () => `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

  // Handle sending chat message
  const handleChatSend = useCallback(async (message: string) => {
    // Add user message to chat
    const userMessage: ChatMessage = {
      id: generateMessageId(),
      role: 'user',
      content: message,
      timestamp: new Date(),
    }
    setChatMessages(prev => [...prev, userMessage])
    setChatLoading(true)

    try {
      // Send to API (exclude the message we just added from history)
      const response = await apiClient.chat(message, chatMessages)

      // Add assistant response with parsed API requests
      const assistantMessage: ChatMessage = {
        id: generateMessageId(),
        role: 'assistant',
        content: response.answer,
        timestamp: new Date(),
        scale: response.scale,
        chordChoices: response.chord_choices,
        visualizations: response.visualizations,
        outOfScope: response.out_of_scope,
        apiRequests: response.api_requests,
      }
      setChatMessages(prev => [...prev, assistantMessage])

      // If visualizations requested and we have parsed chord requests, show the first one
      if (response.visualizations && response.api_requests?.chords?.length) {
        const firstChordRequest = response.api_requests.chords[0]
        await handleChatChordClick(response.chord_choices[0], firstChordRequest)
      }
    } catch (err) {
      console.error('Chat error:', err)
      // Add error message
      const errorMessage: ChatMessage = {
        id: generateMessageId(),
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please make sure the backend is running.',
        timestamp: new Date(),
      }
      setChatMessages(prev => [...prev, errorMessage])
    } finally {
      setChatLoading(false)
    }
  }, [chatMessages])

  // Handle clicking a chord from chat response
  const handleChatChordClick = async (chordName: string, apiRequest?: { root: string; quality: string }) => {
    let root: string
    let quality: string

    if (apiRequest) {
      // Use pre-parsed API request from backend
      root = apiRequest.root
      quality = apiRequest.quality
    } else {
      // Fallback: Parse chord name (e.g., "C major" -> root="C", quality="major")
      const parts = chordName.trim().split(/\s+/)
      if (parts.length < 2) return

      root = parts[0]
      quality = parts.slice(1).join('_').toLowerCase()
    }

    try {
      // Switch to chord mode and load the chord
      setAppMode('chord')
      const data = await apiClient.getChord(root, quality)
      setChordData(data)
      setSelectedChordRoot(root)
      setSelectedChordQuality(quality)
      // Start with no shapes selected - user can click to select
      setActiveChordShapes([])
    } catch (err) {
      console.error('Failed to load chord from chat:', err)
    }
  }

  // Handle clicking a scale from chat response
  const handleChatScaleClick = async (scaleName: string, apiRequest?: { root: string; mode: string }) => {
    let root: string
    let mode: string

    if (apiRequest) {
      // Use pre-parsed API request from backend
      root = apiRequest.root
      mode = apiRequest.mode
    } else {
      // Fallback: Parse scale name (e.g., "A minor pentatonic" -> root="A", mode="minor_pentatonic")
      const parts = scaleName.trim().split(/\s+/)
      if (parts.length < 2) return

      root = parts[0]
      mode = parts.slice(1).join('_').toLowerCase()
    }

    try {
      // Switch to scale mode and load the scale
      setAppMode('scale')
      await handleScaleSelect(root, mode)
    } catch (err) {
      console.error('Failed to load scale from chat:', err)
    }
  }

  // Reset chat to initial state
  const handleChatReset = () => {
    setChatMessages([])
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      {/* Header */}
      <header className="h-16 flex-shrink-0 z-20 border-b" style={{ backgroundColor: 'var(--header-bg)', borderColor: 'var(--border-primary)', boxShadow: 'var(--shadow-sm)' }}>
        <div className="h-full max-w-full mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-8">
            {/* Branded Logo */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white shadow-lg" style={{ background: 'linear-gradient(to bottom right, var(--accent-600), var(--accent-700))', boxShadow: '0 10px 15px -3px var(--accent-glow)' }}>
                {/* App icon (served from src/assets/headstock.png) - smaller in header */}
                <img src={headstockSrc} alt="Guitar Tutor" className="w-9 h-9 rounded-lg object-cover" />
              </div>
              <h1 className="text-lg font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>Guitar Tutor</h1>
            </div>
            
            {/* Mode Toggle */}
            <div className="flex rounded-lg p-1 border" style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-primary)' }}>
              <button
                onClick={() => handleModeSwitch('scale')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  appMode === 'scale' 
                    ? 'shadow-sm border font-bold' 
                    : ''
                }`}
                style={{ 
                  backgroundColor: appMode === 'scale' ? 'var(--card-bg)' : 'transparent',
                  borderColor: appMode === 'scale' ? 'var(--border-primary)' : 'transparent',
                  color: appMode === 'scale' ? 'var(--accent-600)' : 'var(--text-tertiary)'
                }}
              >
                Scale Mode
              </button>
              <button
                onClick={() => handleModeSwitch('chord')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  appMode === 'chord' 
                    ? 'shadow-sm border font-bold' 
                    : ''
                }`}
                style={{ 
                  backgroundColor: appMode === 'chord' ? 'var(--card-bg)' : 'transparent',
                  borderColor: appMode === 'chord' ? 'var(--border-primary)' : 'transparent',
                  color: appMode === 'chord' ? 'var(--accent-600)' : 'var(--text-tertiary)'
                }}
              >
                Chord Mode
              </button>
            </div>
          </div>
          
          {/* Right side controls */}
          <div className="flex items-center gap-4">
            {/* Display Mode Toggle */}
            {(scaleData || chordData) && (
              <div className="flex items-center gap-2 rounded-lg p-1 border" style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-primary)' }}>
                <span className="text-xs font-semibold px-2 uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Display:</span>
                <button
                  onClick={() => setDisplayMode('notes')}
                  className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                    displayMode === 'notes' 
                      ? 'shadow-sm border font-bold' 
                      : ''
                  }`}
                  style={{ 
                    backgroundColor: displayMode === 'notes' ? 'var(--card-bg)' : 'transparent',
                    borderColor: displayMode === 'notes' ? 'var(--border-primary)' : 'transparent',
                    color: displayMode === 'notes' ? 'var(--text-primary)' : 'var(--text-tertiary)'
                  }}
                >
                  Notes
                </button>
                <button
                  onClick={() => setDisplayMode('intervals')}
                  className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                    displayMode === 'intervals' 
                      ? 'shadow-sm border font-bold' 
                      : ''
                  }`}
                  style={{ 
                    backgroundColor: displayMode === 'intervals' ? 'var(--card-bg)' : 'transparent',
                    borderColor: displayMode === 'intervals' ? 'var(--border-primary)' : 'transparent',
                    color: displayMode === 'intervals' ? 'var(--text-primary)' : 'var(--text-tertiary)'
                  }}
                >
                  Intervals
                </button>
              </div>
            )}
            
            {/* Dark Mode Toggle */}
            <button
              onClick={toggleDarkMode}
              className="p-2 rounded-lg transition-all hover:scale-105"
              style={{ 
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-secondary)'
              }}
              title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {darkMode ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                  <path d="M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM18.894 6.166a.75.75 0 00-1.06-1.06l-1.591 1.59a.75.75 0 101.06 1.061l1.591-1.59zM21.75 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5H21a.75.75 0 01.75.75zM17.834 18.894a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 10-1.061 1.06l1.59 1.591zM12 18a.75.75 0 01.75.75V21a.75.75 0 01-1.5 0v-2.25A.75.75 0 0112 18zM7.758 17.303a.75.75 0 00-1.061-1.06l-1.591 1.59a.75.75 0 001.06 1.061l1.591-1.59zM6 12a.75.75 0 01-.75.75H3a.75.75 0 010-1.5h2.25A.75.75 0 016 12zM6.697 7.757a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 00-1.061 1.06l1.59 1.591z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                  <path fillRule="evenodd" d="M9.528 1.718a.75.75 0 01.162.819A8.97 8.97 0 009 6a9 9 0 009 9 8.97 8.97 0 003.463-.69.75.75 0 01.981.98 10.503 10.503 0 01-9.694 6.46c-5.799 0-10.5-4.701-10.5-10.5 0-4.368 2.667-8.112 6.46-9.694a.75.75 0 01.818.162z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Layout: Chat Sidebar + Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat Sidebar - Resizable */}
        <aside 
          className="flex-shrink-0 relative"
          style={{ width: chatWidth }}
        >
          <ChatPanel
            messages={chatMessages}
            isLoading={chatLoading}
            onSendMessage={handleChatSend}
            onChordClick={handleChatChordClick}
            onScaleClick={handleChatScaleClick}
            onReset={handleChatReset}
            darkMode={darkMode}
          />
          {/* Resize Handle */}
          <div
            className="absolute top-0 right-0 w-1 h-full cursor-col-resize transition-colors group"
            style={{ '--hover-color': 'var(--accent-400)' } as React.CSSProperties}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--accent-400)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            onMouseDown={(e) => {
              e.preventDefault();
              const startX = e.clientX;
              const startWidth = chatWidth;
              
              const onMouseMove = (moveEvent: MouseEvent) => {
                const delta = moveEvent.clientX - startX;
                const newWidth = Math.min(Math.max(startWidth + delta, 280), 500); // Min 280px, Max 500px
                setChatWidth(newWidth);
              };
              
              const onMouseUp = () => {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
              };
              
              document.addEventListener('mousemove', onMouseMove);
              document.addEventListener('mouseup', onMouseUp);
            }}
          >
            <div className="absolute top-1/2 -translate-y-1/2 right-0 w-1 h-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" style={{ backgroundColor: 'var(--border-secondary)' }} />
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--main-content-bg)' }}>
          {/* Control Bar */}
          <section className="px-6 pt-6 pb-2 z-10 flex-shrink-0">
            <div className="flex items-center justify-between px-6 py-4 rounded-xl border" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border-primary)', boxShadow: 'var(--shadow-md)' }}>
              <div className="flex items-center gap-6">
                {/* Scale Mode Controls */}
                {appMode === 'scale' && (
                  <>
                    <ScaleSelector
                      selectedRoot={selectedRoot}
                      selectedMode={selectedMode}
                      onSelect={handleScaleSelect}
                      darkMode={darkMode}
                    />
                    
                    {/* Diatonic Chords - inline in control bar */}
                    {scaleData && (
                      <>
                        <div className="h-10 w-px" style={{ backgroundColor: 'var(--border-primary)' }}></div>
                        <DiatonicChordsRow
                          chords={scaleData.diatonic_chords}
                          onChordClick={handleChordClick}
                          selectedChord={selectedDiatonicChord}
                          darkMode={darkMode}
                        />
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
                      onSelect={handleDirectChordSelect}
                      darkMode={darkMode}
                    />
                  </>
                )}
              </div>

              {/* Right side actions */}
              <div className="flex items-center gap-3">
                {appMode === 'chord' && chordData && activeChordShapes.length > 0 && (
                  <PlayTextButton
                    onClick={() => {
                      const activeShape = chordData.caged_shapes.find(s => 
                        activeChordShapes.includes(s.shape)
                      )
                      if (activeShape) {
                        const positions = activeShape.positions.map(p => ({ 
                          string: p.string, 
                          fret: p.fret 
                        }))
                        playChord(positions)
                      }
                    }}
                    duration={getChordDuration(5) * 1000}
                    label="Play Chord"
                  />
                )}
                {(scaleData || chordData) && (
                  <button
                    onClick={handleClearAll}
                    className="px-4 py-2 rounded-lg text-sm font-medium transition-all border"
                    style={{ 
                      backgroundColor: 'var(--card-bg)', 
                      borderColor: 'var(--border-primary)',
                      color: 'var(--text-secondary)'
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* Scrollable Content */}
          <main className="flex-1 overflow-y-auto p-6 space-y-4" style={{ backgroundColor: 'var(--main-content-bg)' }}>
            {/* Chord Diagrams */}
            {chordData && (
              <ChordDiagramRow
                shapes={chordData.caged_shapes}
                activeShapes={activeChordShapes}
                onToggleShape={handleToggleShape}
                isExpanded={diagramsExpanded}
                onToggleExpanded={() => setDiagramsExpanded(!diagramsExpanded)}
                darkMode={darkMode}
              />
            )}

          {loading && (
            <div className="flex items-center justify-center py-12">
              <div style={{ color: 'var(--text-muted)' }}>Loading fretboard...</div>
            </div>
          )}

          {error && (
            <div className="rounded-lg p-4 mb-4 border" style={{ backgroundColor: darkMode ? '#450a0a' : '#fef2f2', borderColor: darkMode ? '#7f1d1d' : '#fecaca' }}>
              <p style={{ color: darkMode ? '#fca5a5' : '#b91c1c' }}>{error}</p>
              <p className="text-sm mt-1" style={{ color: darkMode ? '#f87171' : '#dc2626' }}>
                {/** Show the actual API base the app will call (build-time Vite var or fallback) */}
                Make sure the backend is running and reachable. This app calls the API at{' '}
                <strong>{(import.meta.env as any).VITE_API_BASE_URL ?? '/api'}</strong>
                {'.'} If you're running locally, the backend also listens on <strong>http://localhost:8000</strong>.
              </p>
            </div>
          )}

          {fretboardData && (
            <Fretboard
              strings={fretboardData.strings}
              fretCount={fretboardData.fret_count}
              tuningNotes={fretboardData.tuning_notes}
              scalePositions={chordData ? [] : scaleData?.positions}
              chordShapes={chordData?.caged_shapes}
              activeChordShapes={activeChordShapes}
              displayMode={displayMode}
              onScaleNoteClick={handleScaleNoteClick}
              clickableScaleNotes={clickableScaleNotes}
              darkMode={darkMode}
            />
          )}

          {/* Scale mode hint */}
          {appMode === 'scale' && scaleData && !chordData && (
            <div className="text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              💡 Click on any scale note to see the chord built on that degree
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
    </div>
  )
}

export default App