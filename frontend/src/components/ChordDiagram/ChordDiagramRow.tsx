import type { CagedShape, CagedShapeName } from '../../types'
import { ChordDiagram } from './ChordDiagram'
import { PlayButton } from '../PlayButton'
import { playChord, playArpeggio, getChordDuration } from '../../utils/audio'

interface ChordDiagramRowProps {
  shapes: CagedShape[]
  activeShapes: CagedShapeName[]
  onToggleShape: (shape: CagedShapeName) => void
}

export function ChordDiagramRow({ shapes, activeShapes, onToggleShape }: ChordDiagramRowProps) {
  const handlePlayChord = (shape: CagedShape, e: React.MouseEvent) => {
    e.stopPropagation() // Don't toggle shape when clicking play
    const positions = shape.positions.map(p => ({ string: p.string, fret: p.fret }))
    playChord(positions)
  }
  
  const handlePlayArpeggio = (shape: CagedShape, e: React.MouseEvent) => {
    e.stopPropagation()
    const positions = shape.positions.map(p => ({ string: p.string, fret: p.fret }))
    playArpeggio(positions, 0.15, 0.4, 'up')
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-4">
      <h3 className="text-sm font-medium text-gray-700 mb-3">Chord Diagrams</h3>
      <div className="flex gap-4 overflow-x-auto pb-2">
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
              <div className="flex gap-1 mt-1">
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
