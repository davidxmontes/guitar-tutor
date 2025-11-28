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
    <div className="bg-slate-50 rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-slate-800">CAGED Chord Shapes</h3>
        <span className="text-xs text-slate-500">{shapes.length} shapes</span>
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
