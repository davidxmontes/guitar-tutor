import React from 'react'
import type { CagedShape } from '../../types'
import { CAGED_COLORS } from '../../constants/colors'

interface ChordDiagramProps {
  shape: CagedShape
  isActive: boolean
  onClick?: () => void
  darkMode?: boolean
}

const STRING_SPACING = 24
const FRET_SPACING = 24
const NUM_STRINGS = 6
const DIAGRAM_WIDTH = STRING_SPACING * (NUM_STRINGS - 1) + 2  // gaps between 6 strings + border
const VISIBLE_FRETS = 4
const DOT_RADIUS = 9

// Fixed height for uniform cards
const CARD_HEIGHT = 180

export function ChordDiagram({ shape, isActive, onClick, darkMode: _darkMode = false }: ChordDiagramProps) {
  // Calculate the fret range to display
  const frets = shape.positions.map(p => p.fret)
  const minFret = Math.min(...frets)
  
  // Start fret: 0 if open strings, otherwise min_fret
  const hasOpenStrings = minFret === 0
  const startFret = hasOpenStrings ? 0 : Math.max(1, minFret)
  
  // Calculate diagram height
  const diagramHeight = FRET_SPACING * VISIBLE_FRETS + 2
  
  // Positions indexed by string (1-6)
  const positionsByString = new Map<number, typeof shape.positions[0]>()
  shape.positions.forEach(pos => {
    positionsByString.set(pos.string, pos)
  })
  
  // Get X position for a string (1 = rightmost/high E, 6 = leftmost/low E)
  const getStringX = (stringNum: number) => {
    return 1 + (6 - stringNum) * STRING_SPACING
  }
  
  // Get Y position for a fret (center of fret space)
  const getFretY = (fret: number) => {
    const relativeFret = fret - startFret
    return 1 + relativeFret * FRET_SPACING + FRET_SPACING / 2
  }
  
  // Determine which strings are muted (not played)
  const mutedStrings = new Set<number>()
  const openStrings = new Set<number>()
  for (let s = 1; s <= 6; s++) {
    const pos = positionsByString.get(s)
    if (!pos) {
      mutedStrings.add(s)
    } else if (pos.fret === 0) {
      openStrings.add(s)
    }
  }

  // Check for barre
  const barreInfo = detectBarre(shape, startFret)

  // Get fret label
  const fretLabel = getFretLabel(shape, barreInfo)

  return (
    <div 
      className={`
        bg-white rounded p-1.5 border cursor-pointer transition-all flex flex-col
        ${isActive 
          ? 'border-gray-300 shadow-md ring-2 ring-offset-1' 
          : 'border-gray-200 hover:shadow-sm hover:border-gray-300'
        }
      `}
      style={{
        '--tw-ring-color': isActive ? CAGED_COLORS[shape.shape].hex : 'transparent',
        height: CARD_HEIGHT,
      } as React.CSSProperties}
      onClick={onClick}
    >
      {/* Header with shape name and badge */}
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-xs font-bold text-slate-800">{shape.shape}-Shape</h3>
        <span className={`w-5 h-5 rounded-full ${CAGED_COLORS[shape.shape].bg} text-white text-[10px] font-bold flex items-center justify-center`}>
          {shape.shape}
        </span>
      </div>
      
      {/* Chord diagram */}
      <div className="flex">
        {/* Fret number indicator */}
        <div className="w-4 flex items-start pt-6 text-[10px] font-semibold text-gray-400">
          {startFret}
        </div>
        
        <div>
          {/* Top markers (X for muted, O for open) */}
          <div className="flex mb-1">
            {[6, 5, 4, 3, 2, 1].map(stringNum => (
              <div 
                key={stringNum} 
                className="flex items-center justify-center text-[11px] font-bold text-gray-500"
                style={{ width: STRING_SPACING }}
              >
                {mutedStrings.has(stringNum) ? 'X' : openStrings.has(stringNum) ? 'O' : ''}
              </div>
            ))}
          </div>
        
        <svg 
          width={DIAGRAM_WIDTH} 
          height={diagramHeight}
          className="overflow-visible"
        >
          {/* Background */}
          <rect
            x={0}
            y={0}
            width={DIAGRAM_WIDTH}
            height={diagramHeight}
            fill="white"
            stroke="#94a3b8"
            strokeWidth={1}
          />
          
          {/* Nut (thick line at top for open position) */}
          {hasOpenStrings && (
            <rect
              x={0}
              y={0}
              width={DIAGRAM_WIDTH}
              height={3}
              fill="#374151"
            />
          )}
          
          {/* Fret lines (horizontal) */}
          {Array.from({ length: VISIBLE_FRETS - 1 }).map((_, i) => (
            <line
              key={`fret-${i}`}
              x1={0}
              y1={(i + 1) * FRET_SPACING + 1}
              x2={DIAGRAM_WIDTH}
              y2={(i + 1) * FRET_SPACING + 1}
              stroke="#cbd5e1"
              strokeWidth={1}
            />
          ))}
          
          {/* String lines (vertical) */}
          {Array.from({ length: 6 }).map((_, i) => (
            <line
              key={`string-${i}`}
              x1={getStringX(6 - i)}
              y1={1}
              x2={getStringX(6 - i)}
              y2={diagramHeight - 1}
              stroke="#94a3b8"
              strokeWidth={1}
            />
          ))}
          
          {/* Barre indicator */}
          {barreInfo && (
            <rect
              x={getStringX(barreInfo.maxString) - DOT_RADIUS}
              y={getFretY(barreInfo.fret) - 6}
              width={getStringX(barreInfo.minString) - getStringX(barreInfo.maxString) + DOT_RADIUS * 2}
              height={12}
              rx={6}
              fill={CAGED_COLORS[shape.shape].hex}
              opacity={0.4}
            />
          )}
          
          {/* Finger positions (dots) */}
          {shape.positions
            .filter(pos => pos.fret > 0)
            .map(pos => {
              // Check if this fret is within our visible range
              const relativeFret = pos.fret - startFret
              if (relativeFret < 0 || relativeFret >= VISIBLE_FRETS) return null
              
              const x = getStringX(pos.string)
              const y = getFretY(pos.fret)
              
              return (
                <g key={`pos-${pos.string}-${pos.fret}`}>
                  <circle
                    cx={x}
                    cy={y}
                    r={DOT_RADIUS}
                    fill={CAGED_COLORS[shape.shape].hex}
                    className="drop-shadow-sm"
                  />
                  <text
                    x={x}
                    y={y + 3.5}
                    fontSize="9"
                    fill="white"
                    textAnchor="middle"
                    fontWeight="800"
                  >
                    {pos.interval}
                  </text>
                </g>
              )
            })
          }
        </svg>
        </div>
      </div>
      
      {/* Fret range info - pinned to bottom */}
      <p className="text-[10px] text-gray-500 mt-auto">{fretLabel}</p>
    </div>
  )
}

// Detect if there's a barre chord
function detectBarre(shape: CagedShape, startFret: number): { fret: number; minString: number; maxString: number } | null {
  // Group positions by fret
  const fretGroups = new Map<number, typeof shape.positions>()
  shape.positions.forEach(pos => {
    if (pos.fret > 0) {
      const existing = fretGroups.get(pos.fret) || []
      existing.push(pos)
      fretGroups.set(pos.fret, existing)
    }
  })
  
  // Find the first barre (3+ notes on the same fret)
  for (const [fret, positions] of fretGroups) {
    if (positions.length >= 3 && fret === startFret) {
      const strings = positions.map(p => p.string).sort((a, b) => a - b)
      const minString = Math.min(...strings)
      const maxString = Math.max(...strings)
      
      if (maxString - minString >= 2) {
        return { fret, minString, maxString }
      }
    }
  }
  
  return null
}

// Get fret range label - show separate windows if positions span multiple octaves
function getFretLabel(shape: CagedShape, barreInfo: { fret: number; minString: number; maxString: number } | null): string {
  const frets = shape.positions.map(p => p.fret).sort((a, b) => a - b)
  const uniqueFrets = [...new Set(frets)]
  
  // Group frets into windows (positions within 4 frets are one window)
  const windows: { min: number; max: number }[] = []
  let currentWindow: { min: number; max: number } | null = null
  
  for (const fret of uniqueFrets) {
    if (!currentWindow) {
      currentWindow = { min: fret, max: fret }
    } else if (fret - currentWindow.max <= 4) {
      currentWindow.max = fret
    } else {
      windows.push(currentWindow)
      currentWindow = { min: fret, max: fret }
    }
  }
  if (currentWindow) {
    windows.push(currentWindow)
  }
  
  // Format each window
  const windowLabels = windows.map(w => `Fret ${w.min}-${w.max}`)
  const label = windowLabels.join(', ')
  
  return barreInfo ? `${label} (Barre)` : label
}
