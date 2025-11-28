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
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      {/* Header */}
      <header className="h-16 bg-white border-b border-gray-200 flex-shrink-0 shadow-sm z-20">
        <div className="h-full max-w-full mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-8">
            {/* Branded Logo */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                  <path fillRule="evenodd" d="M19.952 1.651a.75.75 0 01.298.599V16.303a3 3 0 01-2.176 2.884l-1.32.377a2.553 2.553 0 11-1.403-4.909l2.311-.66a1.5 1.5 0 001.088-1.442V6.994l-9 2.572v9.737a3 3 0 01-2.176 2.884l-1.32.377a2.553 2.553 0 11-1.402-4.909l2.31-.66a1.5 1.5 0 001.088-1.442V5.25a.75.75 0 01.544-.721l10.5-3a.75.75 0 01.658.122z" clipRule="evenodd" />
                </svg>
              </div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900">Guitar Tutor</h1>
            </div>
            
            {/* Mode Toggle */}
            <div className="flex bg-gray-100 rounded-lg p-1 border border-gray-200">
              <button
                onClick={() => handleModeSwitch('scale')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  appMode === 'scale' 
                    ? 'bg-white text-blue-700 shadow-sm border border-gray-200 font-bold' 
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200/50'
                }`}
              >
                Scale Mode
              </button>
              <button
                onClick={() => handleModeSwitch('chord')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  appMode === 'chord' 
                    ? 'bg-white text-blue-700 shadow-sm border border-gray-200 font-bold' 
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200/50'
                }`}
              >
                Chord Mode
              </button>
            </div>
          </div>
          
          {/* Right side controls */}
          <div className="flex items-center gap-4">
            {/* Display Mode Toggle */}
            {(scaleData || chordData) && (
              <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1 border border-gray-200">
                <span className="text-xs font-semibold text-gray-500 px-2 uppercase tracking-wide">Display:</span>
                <button
                  onClick={() => setDisplayMode('notes')}
                  className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                    displayMode === 'notes' 
                      ? 'bg-white text-slate-800 shadow-sm border border-gray-200 font-bold' 
                      : 'text-slate-600 hover:text-gray-900 hover:bg-gray-200'
                  }`}
                >
                  Notes
                </button>
                <button
                  onClick={() => setDisplayMode('intervals')}
                  className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                    displayMode === 'intervals' 
                      ? 'bg-white text-slate-800 shadow-sm border border-gray-200 font-bold' 
                      : 'text-slate-600 hover:text-gray-900 hover:bg-gray-200'
                  }`}
                >
                  Intervals
                </button>
              </div>
            )}
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
          />
          {/* Resize Handle */}
          <div
            className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-400 transition-colors group"
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
            <div className="absolute top-1/2 -translate-y-1/2 right-0 w-1 h-8 bg-slate-300 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Control Bar */}
          <section className="bg-white px-8 py-4 border-b border-gray-200 shadow-sm z-10 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                {/* Scale Mode Controls */}
                {appMode === 'scale' && (
                  <>
                    <ScaleSelector
                      selectedRoot={selectedRoot}
                      selectedMode={selectedMode}
                      onSelect={handleScaleSelect}
                    />
                    
                    {/* Diatonic Chords - inline in control bar */}
                    {scaleData && (
                      <>
                        <div className="h-10 w-px bg-gray-200"></div>
                        <DiatonicChordsRow
                          chords={scaleData.diatonic_chords}
                          onChordClick={handleChordClick}
                          selectedChord={selectedDiatonicChord}
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
                    className="px-4 py-2 bg-white hover:bg-gray-50 border border-gray-200 text-slate-700 rounded-lg text-sm font-medium shadow-sm hover:shadow-md transition-all"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* Scrollable Content */}
          <main className="flex-1 overflow-y-auto p-6 space-y-4">
            {/* Chord Diagrams */}
            {chordData && (
              <ChordDiagramRow
                shapes={chordData.caged_shapes}
                activeShapes={activeChordShapes}
                onToggleShape={handleToggleShape}
                isExpanded={diagramsExpanded}
                onToggleExpanded={() => setDiagramsExpanded(!diagramsExpanded)}
              />
            )}

          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="text-gray-500">Loading fretboard...</div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-red-700">{error}</p>
              <p className="text-red-500 text-sm mt-1">
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
            />
          )}

          {/* Scale mode hint */}
          {appMode === 'scale' && scaleData && !chordData && (
            <div className="text-center text-sm text-gray-500">
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