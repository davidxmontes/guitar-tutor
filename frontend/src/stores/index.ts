export { useAppStore } from './useAppStore';
export type { AppMode } from './useAppStore';

// Re-export selector hooks for convenience
export {
  useDarkMode,
  useToggleDarkMode,
  useAppMode,
  useDisplayMode,
  useScaleData,
  useSelectedScale,
  useChordData,
  useSelectedChord,
  useActiveChordShapes,
  useChatMessages,
  useChatLoading,
  useStreamingStatus,
  useChatPanelState,
} from './useAppStore';
