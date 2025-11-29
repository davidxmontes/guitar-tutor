import type { CagedShape, CagedShapeName } from '../../types'
import { ChordDiagram } from './ChordDiagram'
import { PlayButton } from '../PlayButton'
import { playChord, playArpeggio, getChordDuration } from '../../utils/audio'
import { CAGED_COLORS } from '../../constants/colors'

interface ChordDiagramRowProps {
  shapes: CagedShape[]
  activeShapes: CagedShapeName[]
  onToggleShape: (shape: CagedShapeName) => void
  isExpanded: boolean
  onToggleExpanded: () => void
  darkMode?: boolean
}

export function ChordDiagramRow({ shapes, activeShapes, onToggleShape, isExpanded, onToggleExpanded, darkMode = false }: ChordDiagramRowProps) {
  const handlePlayChord = (shape: CagedShape, e: React.MouseEvent) => {
    e.stopPropagation()
    const positions = shape.positions.map(p => ({ string: p.string, fret: p.fret }))
    playChord(positions)
  }
  
  const handlePlayArpeggio = (shape: CagedShape, e: React.MouseEvent) => {
    e.stopPropagation()
    const positions = shape.positions.map(p => ({ string: p.string, fret: p.fret }))
    playArpeggio(positions, 0.15, 0.4, 'up')
  }

  const handleShowAll = () => {
    shapes.forEach(s => {
      if (!activeShapes.includes(s.shape)) {
        onToggleShape(s.shape)
      }
    })
  }

  // Minimized view - compact bar with shape buttons
  if (!isExpanded) {
    return (
      <div 
        className="rounded-xl px-4 py-2 flex items-center justify-between"
        style={{ backgroundColor: 'var(--bg-tertiary)' }}
      >
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>CAGED Chord Shapes</span>
          <div className="flex gap-1">
            {shapes.map(shape => {
              const isActive = activeShapes.includes(shape.shape)
              return (
                <button
                  key={shape.shape}
                  onClick={() => onToggleShape(shape.shape)}
                  className={`w-7 h-7 rounded-md text-xs font-bold transition-all flex items-center justify-center ${
                    isActive
                      ? `${CAGED_COLORS[shape.shape].bg} text-white shadow-sm`
                      : 'border'
                  }`}
                  style={!isActive ? {
                    backgroundColor: 'var(--card-bg)',
                    borderColor: 'var(--border-primary)',
                    color: 'var(--text-secondary)'
                  } : undefined}
                >
                  {shape.shape}
                </button>
              )
            })}
          </div>
          <button
            onClick={handleShowAll}
            className="text-xs px-2 py-1 rounded transition-colors"
            style={{ color: 'var(--text-tertiary)' }}
          >
            All
          </button>
        </div>
        <button
          onClick={onToggleExpanded}
          className="text-xs flex items-center gap-1 transition-colors"
          style={{ color: 'var(--accent-600)' }}
          onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-700)'}
          onMouseLeave={(e) => e.currentTarget.style.color = 'var(--accent-600)'}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
          </svg>
          Show Diagrams
        </button>
      </div>
    )
  }

  // Expanded view - full diagrams
  return (
    <div 
      className="rounded-xl p-3"
      style={{ backgroundColor: 'var(--bg-tertiary)' }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>CAGED Chord Shapes</span>
          <div className="flex gap-1">
            {shapes.map(shape => {
              const isActive = activeShapes.includes(shape.shape)
              return (
                <button
                  key={shape.shape}
                  onClick={() => onToggleShape(shape.shape)}
                  className={`w-7 h-7 rounded-md text-xs font-bold transition-all flex items-center justify-center ${
                    isActive
                      ? `${CAGED_COLORS[shape.shape].bg} text-white shadow-sm`
                      : 'border'
                  }`}
                  style={!isActive ? {
                    backgroundColor: 'var(--card-bg)',
                    borderColor: 'var(--border-primary)',
                    color: 'var(--text-secondary)'
                  } : undefined}
                >
                  {shape.shape}
                </button>
              )
            })}
          </div>
          <button
            onClick={handleShowAll}
            className="text-xs px-2 py-1 rounded transition-colors"
            style={{ color: 'var(--text-tertiary)' }}
          >
            All
          </button>
        </div>
        <button
          onClick={onToggleExpanded}
          className="text-xs flex items-center gap-1 transition-colors"
          style={{ color: 'var(--text-tertiary)' }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M14.77 12.79a.75.75 0 01-1.06-.02L10 8.832 6.29 12.77a.75.75 0 11-1.08-1.04l4.25-4.5a.75.75 0 011.08 0l4.25 4.5a.75.75 0 01-.02 1.06z" clipRule="evenodd" />
          </svg>
          Minimize
        </button>
      </div>
      {/* Horizontally scrollable diagrams container */}
      <div className="overflow-x-auto -mx-3 px-3">
        <div className="flex gap-4 md:gap-6 pb-2">
          {shapes.map(shape => {
            const isActive = activeShapes.includes(shape.shape)
            const positions = shape.positions
            const chordDuration = getChordDuration(positions.length)
            const arpeggioDuration = positions.length * 0.15 + 0.4
            
            return (
              <div key={shape.shape} className="flex flex-col items-center gap-1 flex-shrink-0">
                <ChordDiagram
                  shape={shape}
                  isActive={isActive}
                  onClick={() => onToggleShape(shape.shape)}
                  darkMode={darkMode}
                />
                {/* Play buttons */}
                <div className="flex gap-1">
                  <PlayButton
                    onClick={(e: React.MouseEvent) => handlePlayChord(shape, e)}
                    duration={chordDuration * 1000}
                    size="sm"
                    variant="ghost"
                    label="Strum"
                  />
                  <PlayButton
                    onClick={(e: React.MouseEvent) => handlePlayArpeggio(shape, e)}
                    duration={arpeggioDuration * 1000}
                    size="sm"
                    variant="ghost"
                    label="Arpeggio"
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
