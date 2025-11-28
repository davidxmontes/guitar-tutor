import type { CagedShapeName } from '../types';

// CAGED shape colors - single source of truth
export const CAGED_COLORS: Record<CagedShapeName, {
  bg: string;
  bgHover: string;
  text: string;
  hex: string;
}> = {
  C: {
    bg: 'bg-orange-500',
    bgHover: 'hover:bg-orange-100',
    text: 'text-orange-600',
    hex: '#f97316',
  },
  A: {
    bg: 'bg-yellow-500',
    bgHover: 'hover:bg-yellow-100',
    text: 'text-yellow-600',
    hex: '#eab308',  // yellow-500
  },
  G: {
    bg: 'bg-green-500',
    bgHover: 'hover:bg-green-100',
    text: 'text-green-600',
    hex: '#22c55e',  // green-500
  },
  E: {
    bg: 'bg-blue-500',
    bgHover: 'hover:bg-blue-100',
    text: 'text-blue-600',
    hex: '#3b82f6',
  },
  D: {
    bg: 'bg-purple-500',
    bgHover: 'hover:bg-purple-100',
    text: 'text-purple-600',
    hex: '#a855f7',
  },
};
