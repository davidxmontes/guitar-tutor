export { useAppStore } from './useAppStore';
export type { AppMode } from './useAppStore';

// Re-export selector hooks for convenience
export {
  useDarkMode,
  useToggleDarkMode,
  useAppMode,
  useDisplayMode,
  useShowScaleInChordMode,
  useScaleData,
  useSelectedScale,
  useChordData,
  useSelectedChord,
  useActiveVoicings,
  useChatMessages,
  useChatLoading,
  useStreamingStatus,
  useChatPanelState,
} from './useAppStore';
