import type { CagedShape, CagedShapeName } from '../../types'
import { ChordDiagram } from './ChordDiagram'
import { PlayButton } from '../PlayButton'
import { playChord, playArpeggio, getChordDuration } from '../../utils/audio'

// CAGED shape colors
const SHAPE_COLORS: Record<CagedShapeName, string> = {
  C: 'bg-orange-500',
  A: 'bg-yellow-500',
  G: 'bg-green-500',
  E: 'bg-blue-500',
  D: 'bg-purple-500',
}

interface ChordDiagramRowProps {
  shapes: CagedShape[]
  activeShapes: CagedShapeName[]
  onToggleShape: (shape: CagedShapeName) => void
  isExpanded: boolean
  onToggleExpanded: () => void
}

export function ChordDiagramRow({ shapes, activeShapes, onToggleShape, isExpanded, onToggleExpanded }: ChordDiagramRowProps) {
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
      <div className="bg-slate-50 rounded-xl px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">CAGED Chord Shapes</span>
          <div className="flex gap-1">
            {shapes.map(shape => {
              const isActive = activeShapes.includes(shape.shape)
              return (
                <button
                  key={shape.shape}
                  onClick={() => onToggleShape(shape.shape)}
                  className={`w-7 h-7 rounded-md text-xs font-bold transition-all flex items-center justify-center ${
                    isActive
                      ? `${SHAPE_COLORS[shape.shape]} text-white shadow-sm`
                      : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {shape.shape}
                </button>
              )
            })}
          </div>
          <button
            onClick={handleShowAll}
            className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded hover:bg-slate-100 transition-colors"
          >
            All
          </button>
        </div>
        <button
          onClick={onToggleExpanded}
          className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 transition-colors"
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
    <div className="bg-slate-50 rounded-xl p-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">CAGED Chord Shapes</span>
          <div className="flex gap-1">
            {shapes.map(shape => {
              const isActive = activeShapes.includes(shape.shape)
              return (
                <button
                  key={shape.shape}
                  onClick={() => onToggleShape(shape.shape)}
                  className={`w-7 h-7 rounded-md text-xs font-bold transition-all flex items-center justify-center ${
                    isActive
                      ? `${SHAPE_COLORS[shape.shape]} text-white shadow-sm`
                      : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {shape.shape}
                </button>
              )
            })}
          </div>
          <button
            onClick={handleShowAll}
            className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded hover:bg-slate-100 transition-colors"
          >
            All
          </button>
        </div>
        <button
          onClick={onToggleExpanded}
          className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M14.77 12.79a.75.75 0 01-1.06-.02L10 8.832 6.29 12.77a.75.75 0 11-1.08-1.04l4.25-4.5a.75.75 0 011.08 0l4.25 4.5a.75.75 0 01-.02 1.06z" clipRule="evenodd" />
          </svg>
          Minimize
        </button>
      </div>
      <div className="flex gap-6">
        {shapes.map(shape => {
          const isActive = activeShapes.includes(shape.shape)
          const positions = shape.positions
          const chordDuration = getChordDuration(positions.length)
          const arpeggioDuration = positions.length * 0.15 + 0.4
          
          return (
            <div key={shape.shape} className="flex flex-col items-center gap-1">
              <ChordDiagram
                shape={shape}
                isActive={isActive}
                onClick={() => onToggleShape(shape.shape)}
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
  )
}
