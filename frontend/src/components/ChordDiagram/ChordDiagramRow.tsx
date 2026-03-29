import type { ChordVoicing } from '../../types'
import { ChordDiagram } from './ChordDiagram'
import { PlayButton } from '../PlayButton'
import { playChord, playArpeggio, getChordDuration } from '../../utils/audio'
import { getVoicingColor } from '../../constants/colors'

interface ChordDiagramRowProps {
  voicings: ChordVoicing[]
  activeVoicings: string[]
  onToggleVoicing: (label: string) => void
  isExpanded: boolean
  onToggleExpanded: () => void
}

export function ChordDiagramRow({ voicings, activeVoicings, onToggleVoicing, isExpanded, onToggleExpanded }: ChordDiagramRowProps) {
  const handlePlayChord = (voicing: ChordVoicing, e: React.MouseEvent) => {
    e.stopPropagation()
    const positions = voicing.positions.map(p => ({ string: p.string, fret: p.fret }))
    playChord(positions)
  }

  const handlePlayArpeggio = (voicing: ChordVoicing, e: React.MouseEvent) => {
    e.stopPropagation()
    const positions = voicing.positions.map(p => ({ string: p.string, fret: p.fret }))
    playArpeggio(positions, 0.15, 0.4, 'up')
  }

  const handleShowAll = () => {
    voicings.forEach(v => {
      if (!activeVoicings.includes(v.label)) {
        onToggleVoicing(v.label)
      }
    })
  }

  if (!isExpanded) {
    return (
      <div
        className="rounded-xl px-4 py-2 flex items-center justify-between"
        style={{ backgroundColor: 'var(--bg-tertiary)' }}
      >
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Chord Voicings</span>
          <div className="flex gap-1">
            {voicings.map(voicing => {
              const isActive = activeVoicings.includes(voicing.label)
              const color = getVoicingColor(voicing.label)
              return (
                <button
                  key={voicing.label}
                  onClick={() => onToggleVoicing(voicing.label)}
                  className={`min-w-12 h-7 rounded-md text-xs font-bold transition-all px-2 flex items-center justify-center ${
                    isActive
                      ? `${color.bg} text-white shadow-sm`
                      : 'border'
                  }`}
                  style={!isActive ? {
                    backgroundColor: 'var(--card-bg)',
                    borderColor: 'var(--border-primary)',
                    color: 'var(--text-secondary)'
                  } : undefined}
                >
                  {voicing.label}
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

  return (
    <div
      className="rounded-xl p-3"
      style={{ backgroundColor: 'var(--bg-tertiary)' }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Chord Voicings</span>
          <div className="flex gap-1">
            {voicings.map(voicing => {
              const isActive = activeVoicings.includes(voicing.label)
              const color = getVoicingColor(voicing.label)
              return (
                <button
                  key={voicing.label}
                  onClick={() => onToggleVoicing(voicing.label)}
                  className={`min-w-12 h-7 rounded-md text-xs font-bold transition-all px-2 flex items-center justify-center ${
                    isActive
                      ? `${color.bg} text-white shadow-sm`
                      : 'border'
                  }`}
                  style={!isActive ? {
                    backgroundColor: 'var(--card-bg)',
                    borderColor: 'var(--border-primary)',
                    color: 'var(--text-secondary)'
                  } : undefined}
                >
                  {voicing.label}
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
      <div className="overflow-x-auto -mx-3 px-3 pt-1">
        <div className="flex gap-4 md:gap-6 pb-2">
          {voicings.map(voicing => {
            const isActive = activeVoicings.includes(voicing.label)
            const positions = voicing.positions
            const chordDuration = getChordDuration(positions.length)
            const arpeggioDuration = positions.length * 0.15 + 0.4

            return (
              <div key={voicing.label} className="flex flex-col items-center gap-1 flex-shrink-0">
                <ChordDiagram
                  shape={voicing}
                  isActive={isActive}
                  onClick={() => onToggleVoicing(voicing.label)}
                />
                <div className="flex gap-1">
                  <PlayButton
                    onClick={(e: React.MouseEvent) => handlePlayChord(voicing, e)}
                    duration={chordDuration * 1000}
                    size="sm"
                    variant="ghost"
                    label="Strum"
                  />
                  <PlayButton
                    onClick={(e: React.MouseEvent) => handlePlayArpeggio(voicing, e)}
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
