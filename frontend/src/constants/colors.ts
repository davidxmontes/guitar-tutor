export interface VoicingColor {
  bg: string;
  bgHover: string;
  text: string;
  hex: string;
}

export const VOICING_COLORS: VoicingColor[] = [
  { bg: 'bg-orange-500', bgHover: 'hover:bg-orange-100', text: 'text-orange-700', hex: '#f97316' },
  { bg: 'bg-amber-500', bgHover: 'hover:bg-amber-100', text: 'text-amber-700', hex: '#f59e0b' },
  { bg: 'bg-violet-500', bgHover: 'hover:bg-violet-100', text: 'text-violet-700', hex: '#8b5cf6' },
  { bg: 'bg-cyan-500', bgHover: 'hover:bg-cyan-100', text: 'text-cyan-700', hex: '#06b6d4' },
  { bg: 'bg-blue-500', bgHover: 'hover:bg-blue-100', text: 'text-blue-700', hex: '#3b82f6' },
  { bg: 'bg-rose-500', bgHover: 'hover:bg-rose-100', text: 'text-rose-700', hex: '#f43f5e' },
];

function getLabelIndex(label?: string): number {
  if (!label) return 0;

  const match = label.match(/(\d+)/);
  if (match) {
    return Math.max(0, Number(match[1]) - 1);
  }

  let hash = 0;
  for (let i = 0; i < label.length; i += 1) {
    hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function getVoicingColor(label?: string): VoicingColor {
  return VOICING_COLORS[getLabelIndex(label) % VOICING_COLORS.length];
}
