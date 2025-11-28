import { useState, useEffect, useCallback } from 'react'
import type { ChordResponse } from '../../types'
import { ChordDiagram } from '../ChordDiagram/ChordDiagram'
import { playChord, playArpeggio } from '../../utils/audio'

interface ChordPopupProps {
  chordData: ChordResponse
  position: { x: number; y: number }
  clickedFret?: number  // The fret that was clicked to open this popup
  onClose: () => void
}

// Find the best matching shape index based on clicked fret
function findBestShapeIndex(chordData: ChordResponse, clickedFret?: number): number {
  if (clickedFret === undefined || chordData.caged_shapes.length === 0) {
    return 0
  }
  
  // Find the shape whose fret range best contains the clicked fret
  let bestIndex = 0
  let bestScore = Infinity
  
  chordData.caged_shapes.forEach((shape, index) => {
    const { min_fret, max_fret } = shape
    
    // If clicked fret is within this shape's range, prioritize it
    if (clickedFret >= min_fret && clickedFret <= max_fret) {
      // Score based on how centered the click is in the shape
      const center = (min_fret + max_fret) / 2
      const score = Math.abs(clickedFret - center)
      if (score < bestScore) {
        bestScore = score
        bestIndex = index
      }
    }
  })
  
  // If no shape contains the fret, find the closest one
  if (bestScore === Infinity) {
    chordData.caged_shapes.forEach((shape, index) => {
      const { min_fret, max_fret } = shape
      const distToMin = Math.abs(clickedFret - min_fret)
      const distToMax = Math.abs(clickedFret - max_fret)
      const dist = Math.min(distToMin, distToMax)
      if (dist < bestScore) {
        bestScore = dist
        bestIndex = index
      }
    })
  }
  
  return bestIndex
}

export function ChordPopup({ chordData, position, clickedFret, onClose }: ChordPopupProps) {
  // Initialize with the best matching shape based on clicked fret
  const [currentShapeIndex, setCurrentShapeIndex] = useState(() => 
    findBestShapeIndex(chordData, clickedFret)
  )
  const shapes = chordData.caged_shapes
  const currentShape = shapes[currentShapeIndex]

  // Handle escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'ArrowLeft') {
        setCurrentShapeIndex(prev => (prev - 1 + shapes.length) % shapes.length)
      } else if (e.key === 'ArrowRight') {
        setCurrentShapeIndex(prev => (prev + 1) % shapes.length)
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, shapes.length])

  // Handle click outside to close
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }, [onClose])

  const handlePlayChord = () => {
    const positions = currentShape.positions.map(p => ({ string: p.string, fret: p.fret }))
    playChord(positions)
  }

  const handlePlayArpeggio = () => {
    const positions = currentShape.positions.map(p => ({ string: p.string, fret: p.fret }))
    playArpeggio(positions, 0.15, 0.4, 'up')
  }

  const prevShape = () => {
    setCurrentShapeIndex(prev => (prev - 1 + shapes.length) % shapes.length)
  }

  const nextShape = () => {
    setCurrentShapeIndex(prev => (prev + 1) % shapes.length)
  }

  // Calculate popup position (keep it in viewport)
  const popupStyle: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(position.x, window.innerWidth - 280),
    top: Math.min(position.y + 10, window.innerHeight - 350),
    zIndex: 50,
  }

  return (
    <div 
      className="fixed inset-0 z-40"
      onClick={handleBackdropClick}
    >
      <div 
        style={popupStyle}
        className="bg-white rounded-xl shadow-2xl border border-gray-200 p-4 w-64 animate-in fade-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold text-gray-900">
            {chordData.display_name}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Chord notes */}
        <div className="text-sm text-gray-500 mb-3">
          Notes: {chordData.chord_notes.join(' - ')}
        </div>

        {/* Shape selector */}
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={prevShape}
            className="p-1 rounded-full hover:bg-gray-100 text-gray-600"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          
          <div className="flex items-center gap-2">
            <span 
              className="text-sm font-medium px-2 py-1 rounded"
              style={{ 
                backgroundColor: currentShape.color + '20',
                color: currentShape.color,
              }}
            >
              {currentShape.shape} Shape
            </span>
            <span className="text-xs text-gray-400">
              {currentShapeIndex + 1} / {shapes.length}
            </span>
          </div>
          
          <button
            onClick={nextShape}
            className="p-1 rounded-full hover:bg-gray-100 text-gray-600"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Chord diagram */}
        <div className="flex justify-center mb-3">
          <ChordDiagram
            shape={currentShape}
            isActive={true}
          />
        </div>

        {/* Play buttons */}
        <div className="flex justify-center gap-2">
          <button
            onClick={handlePlayChord}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
            Strum
          </button>
          <button
            onClick={handlePlayArpeggio}
            className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
            Arpeggio
          </button>
        </div>

        {/* Keyboard hint */}
        <div className="mt-3 text-xs text-center text-gray-400">
          ← → to change shape • Esc to close
        </div>
      </div>
    </div>
  )
}
