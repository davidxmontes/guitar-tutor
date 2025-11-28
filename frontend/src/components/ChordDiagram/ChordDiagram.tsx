import React from 'react'
import type { CagedShape } from '../../types'

interface ChordDiagramProps {
  shape: CagedShape
  isActive: boolean
  onClick?: () => void
}

const STRING_SPACING = 20
const FRET_SPACING = 24
const DIAGRAM_WIDTH = STRING_SPACING * 5 + 20  // 5 gaps + padding
const VISIBLE_FRETS = 5
const DOT_RADIUS = 7
const OPEN_RADIUS = 5

export function ChordDiagram({ shape, isActive, onClick }: ChordDiagramProps) {
  // Calculate the fret range to display
  const frets = shape.positions.map(p => p.fret)
  const minFret = Math.min(...frets)
  
  // Start fret: 0 if open strings, otherwise min_fret - 1 (with minimum of 1)
  const hasOpenStrings = minFret === 0
  const startFret = hasOpenStrings ? 0 : Math.max(1, minFret)
  
  // Calculate diagram height
  const diagramHeight = FRET_SPACING * VISIBLE_FRETS + 40
  
  // Positions indexed by string (1-6)
  const positionsByString = new Map<number, typeof shape.positions[0]>()
  shape.positions.forEach(pos => {
    positionsByString.set(pos.string, pos)
  })
  
  // Get X position for a string (1 = rightmost/high E, 6 = leftmost/low E)
  const getStringX = (stringNum: number) => {
    return 10 + (6 - stringNum) * STRING_SPACING
  }
  
  // Get Y position for a fret
  const getFretY = (fret: number) => {
    const relativeFret = fret - startFret
    return 30 + relativeFret * FRET_SPACING
  }
  
  // Determine which strings are muted (not played)
  const mutedStrings = new Set<number>()
  for (let s = 1; s <= 6; s++) {
    if (!positionsByString.has(s)) {
      mutedStrings.add(s)
    }
  }

  return (
    <div 
      className={`
        flex flex-col items-center p-2 rounded-lg cursor-pointer transition-all
        ${isActive 
          ? 'bg-gray-100 ring-2 ring-offset-1' 
          : 'hover:bg-gray-50'
        }
      `}
      style={{
        '--tw-ring-color': isActive ? shape.color : 'transparent',
      } as React.CSSProperties}
      onClick={onClick}
    >
      {/* Shape name */}
      <div className="text-xs font-medium text-gray-600 mb-1">
        {shape.shape} Shape
      </div>
      
      <svg 
        width={DIAGRAM_WIDTH} 
        height={diagramHeight}
        className="overflow-visible"
      >
        {/* Fret position indicator */}
        {startFret > 0 && (
          <text
            x={0}
            y={getFretY(startFret) + FRET_SPACING / 2 + 4}
            fontSize="10"
            fill="#666"
            textAnchor="middle"
          >
            {startFret}fr
          </text>
        )}
        
        {/* Nut (thick line at top for open position) */}
        {hasOpenStrings && (
          <rect
            x={10}
            y={28}
            width={STRING_SPACING * 5}
            height={4}
            fill="#333"
          />
        )}
        
        {/* Fret lines */}
        {Array.from({ length: VISIBLE_FRETS + 1 }).map((_, i) => (
          <line
            key={`fret-${i}`}
            x1={10}
            y1={30 + i * FRET_SPACING}
            x2={10 + STRING_SPACING * 5}
            y2={30 + i * FRET_SPACING}
            stroke="#999"
            strokeWidth={1}
          />
        ))}
        
        {/* String lines */}
        {Array.from({ length: 6 }).map((_, i) => (
          <line
            key={`string-${i}`}
            x1={10 + i * STRING_SPACING}
            y1={30}
            x2={10 + i * STRING_SPACING}
            y2={30 + VISIBLE_FRETS * FRET_SPACING}
            stroke="#666"
            strokeWidth={i < 3 ? 1 : 1.5 + (i - 2) * 0.3}
          />
        ))}
        
        {/* Muted string X marks */}
        {Array.from(mutedStrings).map(stringNum => (
          <g key={`mute-${stringNum}`}>
            <line
              x1={getStringX(stringNum) - 4}
              y1={18}
              x2={getStringX(stringNum) + 4}
              y2={26}
              stroke="#666"
              strokeWidth={2}
            />
            <line
              x1={getStringX(stringNum) + 4}
              y1={18}
              x2={getStringX(stringNum) - 4}
              y2={26}
              stroke="#666"
              strokeWidth={2}
            />
          </g>
        ))}
        
        {/* Open string circles */}
        {shape.positions
          .filter(pos => pos.fret === 0)
          .map(pos => (
            <circle
              key={`open-${pos.string}`}
              cx={getStringX(pos.string)}
              cy={22}
              r={OPEN_RADIUS}
              fill="none"
              stroke={pos.is_root ? shape.color : '#666'}
              strokeWidth={pos.is_root ? 2 : 1.5}
            />
          ))
        }
        
        {/* Finger positions (dots) */}
        {shape.positions
          .filter(pos => pos.fret > 0)
          .map(pos => {
            // Check if this fret is within our visible range
            const relativeFret = pos.fret - startFret
            if (relativeFret < 0 || relativeFret > VISIBLE_FRETS) return null
            
            const x = getStringX(pos.string)
            const y = getFretY(pos.fret) - FRET_SPACING / 2
            
            return (
              <g key={`pos-${pos.string}-${pos.fret}`}>
                <circle
                  cx={x}
                  cy={y}
                  r={DOT_RADIUS}
                  fill={pos.is_root ? shape.color : '#333'}
                />
                <text
                  x={x}
                  y={y + 3}
                  fontSize="9"
                  fill="white"
                  textAnchor="middle"
                  fontWeight="bold"
                >
                  {pos.interval}
                </text>
              </g>
            )
          })
        }
        
        {/* Barre indicator (if multiple notes on same fret) */}
        {renderBarre(shape, startFret, getStringX, getFretY)}
      </svg>
      
      {/* Fret range info - show both octaves if present */}
      <div className="text-xs text-gray-400 mt-1">
        {getFretRangeLabel(shape)}
      </div>
    </div>
  )
}

// Helper to get fret range label, showing both octaves if present
function getFretRangeLabel(shape: CagedShape): string {
  const frets = shape.positions.map(p => p.fret)
  const uniqueFrets = [...new Set(frets)].sort((a, b) => a - b)
  
  // Group frets into ranges (positions within 6 frets of each other are one group)
  const ranges: { min: number; max: number }[] = []
  let currentRange: { min: number; max: number } | null = null
  
  for (const fret of uniqueFrets) {
    if (!currentRange) {
      currentRange = { min: fret, max: fret }
    } else if (fret - currentRange.max <= 6) {
      currentRange.max = fret
    } else {
      ranges.push(currentRange)
      currentRange = { min: fret, max: fret }
    }
  }
  if (currentRange) {
    ranges.push(currentRange)
  }
  
  // Format the ranges
  if (ranges.length === 1) {
    return `Frets ${ranges[0].min}-${ranges[0].max}`
  } else if (ranges.length === 2) {
    return `Frets ${ranges[0].min}-${ranges[0].max} & ${ranges[1].min}-${ranges[1].max}`
  } else {
    return `Frets ${shape.min_fret}-${shape.max_fret}`
  }
}

// Helper to render barre chord indicator
function renderBarre(
  shape: CagedShape,
  _startFret: number,
  getStringX: (s: number) => number,
  getFretY: (f: number) => number
) {
  // Group positions by fret
  const fretGroups = new Map<number, typeof shape.positions>()
  shape.positions.forEach(pos => {
    if (pos.fret > 0) {
      const existing = fretGroups.get(pos.fret) || []
      existing.push(pos)
      fretGroups.set(pos.fret, existing)
    }
  })
  
  // Check for barres (3+ notes on the same fret spanning multiple strings)
  const barres: React.ReactNode[] = []
  
  fretGroups.forEach((positions, fret) => {
    if (positions.length >= 3) {
      const strings = positions.map(p => p.string).sort((a, b) => a - b)
      const minString = Math.min(...strings)
      const maxString = Math.max(...strings)
      
      // Only show barre if it spans at least 3 strings and positions are consecutive
      if (maxString - minString >= 2) {
        const y = getFretY(fret) - FRET_SPACING / 2
        const x1 = getStringX(maxString) - 3
        const x2 = getStringX(minString) + 3
        
        barres.push(
          <rect
            key={`barre-${fret}`}
            x={x1}
            y={y - DOT_RADIUS}
            width={x2 - x1}
            height={DOT_RADIUS * 2}
            rx={DOT_RADIUS}
            fill="#333"
            opacity={0.3}
          />
        )
      }
    }
  })
  
  return barres
}
