import type { ReactNode, RefObject } from 'react';
import './PlayAlong.css';

export function PlayAlongLanes({ svgRef, clipId, width, height = 280, tuningNotes, label, description, children }: {
  svgRef: RefObject<SVGSVGElement | null>; clipId: string; width: number; height?: number;
  tuningNotes: readonly string[] | null; label: string; description: string; children: ReactNode;
}) {
  const right = Math.max(104, width - 16);
  return <svg ref={svgRef} className="play-along-lanes" width="100%" height={height} role="img"
    aria-label={label} aria-describedby={`${clipId}-description`}>
    <desc id={`${clipId}-description`}>{description}</desc>
    <defs><clipPath id={clipId}><rect x={36} y={44} width={Math.max(0, width - 36)} height={height - 44} /></clipPath></defs>
    <text className="play-along-heading" x={72} y={20} textAnchor="middle">Play here</text>
    <text className="play-along-heading play-along-muted" x={right} y={20} textAnchor="end">Coming next</text>
    {Array.from({ length: 6 }, (_, string) => {
      const y = 64 + string * 36;
      return <g key={string}>
        <text className="play-along-string" x={16} y={y} dominantBaseline="central" textAnchor="middle">{tuningNotes?.[string] ?? `${string + 1}`}</text>
        <line className="play-along-string-line" x1={36} x2={right} y1={y} y2={y} />
      </g>;
    })}
    <rect className="play-along-cursor-wash" x={68} y={46} width={8} height={216} rx={4} />
    <line className="play-along-cursor" x1={72} x2={72} y1={46} y2={262} />
    {children}
  </svg>;
}
