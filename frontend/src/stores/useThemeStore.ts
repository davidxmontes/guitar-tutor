import { create } from 'zustand';

interface ThemeState {
  darkMode: boolean;
  toggleDarkMode: () => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  darkMode: (() => {
    if (typeof window === 'undefined') return false;
    const saved = localStorage.getItem('darkMode');
    return saved === null ? window.matchMedia('(prefers-color-scheme: dark)').matches : saved === 'true';
  })(),
  toggleDarkMode: () => set((state) => {
    const darkMode = !state.darkMode;
    localStorage.setItem('darkMode', String(darkMode));
    return { darkMode };
  }),
}));
