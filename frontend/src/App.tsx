import { useEffect, useState, useMemo, useCallback } from 'react'
import { Fretboard } from './components/Fretboard'
import { ScaleSelector } from './components/ScaleSelector/ScaleSelector'
import { ChordSelector } from './components/ChordSelector/ChordSelector'
import { DiatonicChordsRow } from './components/DiatonicChordsRow/DiatonicChordsRow'
import { CagedShapeFilter } from './components/CagedShapeFilter/CagedShapeFilter'
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
  const [fretboardData, setFretboardData] = useState<FretboardResponse | null>(null)
  const [scaleData, setScaleData] = useState<ScaleResponse | null>(null)
  const [chordData, setChordData] = useState<ChordResponse | null>(null)
  const [selectedRoot, setSelectedRoot] = useState<string | null>(null)
  const [selectedMode, setSelectedMode] = useState<string | null>(null)
  const [selectedChordRoot, setSelectedChordRoot] = useState<string | null>(null)
  const [selectedChordQuality, setSelectedChordQuality] = useState<string | null>(null)
  const [selectedDiatonicChord, setSelectedDiatonicChord] = useState<DiatonicChord | null>(null)
  const [activeChordShapes, setActiveChordShapes] = useState<CagedShapeName[]>([])
  const [displayMode, setDisplayMode] = useState<DisplayMode>('notes')
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

  // Handle scale selection
  const handleScaleSelect = async (root: string, mode: string) => {
    try {
      const data = await apiClient.getScale(root, mode)
      setScaleData(data)
      setSelectedRoot(root)
      setSelectedMode(mode)
      // Clear chord data when changing scale
      setChordData(null)
      setSelectedDiatonicChord(null)
      setActiveChordShapes([])
    } catch (err) {
      console.error('Failed to fetch scale:', err)
      setError(err instanceof Error ? err.message : 'Failed to load scale')
    }
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
    setSelectedRoot(null)
    setSelectedMode(null)
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

  // Show all shapes
  const handleShowAllShapes = () => {
    if (chordData) {
      setActiveChordShapes(chordData.caged_shapes.map(s => s.shape))
    }
  }

  // Clear all selections
  const handleClearAll = () => {
    setScaleData(null)
    setChordData(null)
    setSelectedRoot(null)
    setSelectedMode(null)
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
    <div className="h-screen flex flex-col bg-gray-100 overflow-hidden">
      {/* Header */}
      <header className="bg-white shadow-sm flex-shrink-0">
        <div className="max-w-full mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              Guitar Tutor
            </h1>
            
            {/* Mode Toggle */}
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => handleModeSwitch('scale')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  appMode === 'scale' 
                    ? 'bg-white text-gray-900 shadow-sm' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Scale Mode
              </button>
              <button
                onClick={() => handleModeSwitch('chord')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  appMode === 'chord' 
                    ? 'bg-white text-gray-900 shadow-sm' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Chord Mode
              </button>
            </div>
          </div>
          
          {/* Display Mode Toggle */}
          {(scaleData || chordData) && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Display:</span>
              <div className="flex bg-gray-200 rounded-lg p-1">
                <button
                  onClick={() => setDisplayMode('notes')}
                  className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                    displayMode === 'notes' 
                      ? 'bg-white text-gray-900 shadow-sm' 
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Notes
                </button>
                <button
                  onClick={() => setDisplayMode('intervals')}
                  className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                    displayMode === 'intervals' 
                      ? 'bg-white text-gray-900 shadow-sm' 
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Intervals
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main Layout: Chat Sidebar + Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat Sidebar */}
        <aside className="w-80 flex-shrink-0">
          <ChatPanel
            messages={chatMessages}
            isLoading={chatLoading}
            onSendMessage={handleChatSend}
            onChordClick={handleChatChordClick}
            onScaleClick={handleChatScaleClick}
            onReset={handleChatReset}
          />
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
          {/* Scale Mode Controls */}
          {appMode === 'scale' && (
            <>
              <div className="flex items-center gap-4">
                <ScaleSelector
                  selectedRoot={selectedRoot}
                  selectedMode={selectedMode}
                  onSelect={handleScaleSelect}
                />
                {(scaleData || chordData) && (
                  <button
                    onClick={handleClearAll}
                    className="px-3 py-2 text-gray-500 hover:text-gray-700 text-sm"
                  >
                    Clear All
                  </button>
                )}
              </div>

              {/* Diatonic Chords Row */}
              {scaleData && (
                <DiatonicChordsRow
                  chords={scaleData.diatonic_chords}
                  onChordClick={handleChordClick}
                  selectedChord={selectedDiatonicChord}
                />
              )}
            </>
          )}

          {/* Chord Mode Controls */}
          {appMode === 'chord' && (
            <div className="flex items-center gap-4">
              <ChordSelector
                selectedRoot={selectedChordRoot}
                selectedQuality={selectedChordQuality}
                onSelect={handleDirectChordSelect}
              />
              {chordData && activeChordShapes.length > 0 && (
                <PlayTextButton
                  onClick={() => {
                    // Play the first active shape
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
              {chordData && (
                <button
                  onClick={handleClearAll}
                  className="px-3 py-2 text-gray-500 hover:text-gray-700 text-sm"
                >
                  Clear
                </button>
              )}
            </div>
          )}

          {/* CAGED Shape Filter */}
          {chordData && (
            <CagedShapeFilter
              shapes={chordData.caged_shapes}
              activeShapes={activeChordShapes}
              onToggleShape={handleToggleShape}
              onShowAll={handleShowAllShapes}
            />
          )}

          {/* Chord Diagrams */}
          {chordData && (
            <ChordDiagramRow
              shapes={chordData.caged_shapes}
              activeShapes={activeChordShapes}
              onToggleShape={handleToggleShape}
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
                Make sure the backend is running on http://localhost:8000
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