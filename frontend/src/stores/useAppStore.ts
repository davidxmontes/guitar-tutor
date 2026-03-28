import { create } from 'zustand';
import { apiClient, nodeLabel } from '../api/client';
import type {
  ScaleResponse, 
  ChordResponse, 
  DiatonicChord, 
  CagedShapeName,
  DisplayMode 
} from '../types';
import type { ChatMessage } from '../types/chat';

// App mode type
export type AppMode = 'scale' | 'chord';

// Generate unique message IDs
function generateMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Generate unique thread IDs
function generateThreadId(): string {
  return `thread-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// localStorage keys
const STORAGE_KEY_THREAD = 'guitar-tutor-thread-id';
const STORAGE_KEY_MESSAGES = 'guitar-tutor-messages';

function loadThreadId(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_THREAD);
    if (stored) return stored;
    const newId = generateThreadId();
    localStorage.setItem(STORAGE_KEY_THREAD, newId);
    return newId;
  } catch {
    return generateThreadId();
  }
}

function loadMessages(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_MESSAGES);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return parsed.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }));
  } catch {
    return [];
  }
}

function persistThread(threadId: string, messages: ChatMessage[]) {
  try {
    localStorage.setItem(STORAGE_KEY_THREAD, threadId);
    localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(messages));
  } catch { /* storage full or unavailable */ }
}

// ============================================================================
// Theme Slice
// ============================================================================
interface ThemeSlice {
  darkMode: boolean;
  toggleDarkMode: () => void;
}

// ============================================================================
// UI Slice (display mode, app mode, diagrams, popup)
// ============================================================================
interface PopupState {
  chordData: ChordResponse;
  position: { x: number; y: number };
  clickedFret: number;
}

interface UISlice {
  appMode: AppMode;
  displayMode: DisplayMode;
  diagramsExpanded: boolean;
  popupState: PopupState | null;
  setAppMode: (mode: AppMode) => void;
  setDisplayMode: (mode: DisplayMode) => void;
  setDiagramsExpanded: (expanded: boolean) => void;
  setPopupState: (state: PopupState | null) => void;
}

// ============================================================================
// Scale Slice
// ============================================================================
interface ScaleSlice {
  scaleData: ScaleResponse | null;
  selectedRoot: string;
  selectedMode: string;
  selectedDiatonicChord: DiatonicChord | null;
  scaleLoading: boolean;
  scaleError: string | null;
  setScaleData: (data: ScaleResponse | null) => void;
  setSelectedRoot: (root: string) => void;
  setSelectedMode: (mode: string) => void;
  setSelectedDiatonicChord: (chord: DiatonicChord | null) => void;
  fetchScale: (root: string, mode: string) => Promise<void>;
  clearScale: () => void;
  resetScale: () => void;
}

// ============================================================================
// Chord Slice
// ============================================================================
interface ChordSlice {
  chordData: ChordResponse | null;
  selectedChordRoot: string | null;
  selectedChordQuality: string | null;
  activeChordShapes: CagedShapeName[];
  chordLoading: boolean;
  chordError: string | null;
  setChordData: (data: ChordResponse | null) => void;
  setSelectedChordRoot: (root: string | null) => void;
  setSelectedChordQuality: (quality: string | null) => void;
  setActiveChordShapes: (shapes: CagedShapeName[]) => void;
  toggleChordShape: (shape: CagedShapeName) => void;
  fetchChord: (root: string, quality: string) => Promise<ChordResponse | null>;
  clearChord: () => void;
  resetChord: () => void;
}

// ============================================================================
// Chat Slice
// ============================================================================
interface ChatSlice {
  messages: ChatMessage[];
  chatLoading: boolean;
  streamingStatus: string | null;
  threadId: string;  // For tracking conversation with interrupts
  addMessage: (message: ChatMessage) => void;
  sendMessage: (message: string) => Promise<ChatMessage | null>;
  resetChat: () => void;
  setThreadId: (id: string) => void;
}

// ============================================================================
// Chat Panel Slice (UI state for chat panel)
// ============================================================================
interface ChatPanelSlice {
  chatWidth: number;
  chatCollapsed: boolean;
  mobileSheetOpen: boolean;
  setChatWidth: (width: number) => void;
  toggleCollapsed: () => void;
  setMobileSheetOpen: (open: boolean) => void;
}

// ============================================================================
// Combined Store Type
// ============================================================================
type AppStore = ThemeSlice & UISlice & ScaleSlice & ChordSlice & ChatSlice & ChatPanelSlice;

// ============================================================================
// Store Implementation
// ============================================================================
export const useAppStore = create<AppStore>((set, get) => ({
  // --------------------------------------------------------------------------
  // Theme Slice
  // --------------------------------------------------------------------------
  darkMode: (() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('darkMode');
      if (saved !== null) return saved === 'true';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  })(),
  
  toggleDarkMode: () => {
    set((state) => {
      const newMode = !state.darkMode;
      localStorage.setItem('darkMode', String(newMode));
      // Apply to DOM
      if (newMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      return { darkMode: newMode };
    });
  },

  // --------------------------------------------------------------------------
  // UI Slice
  // --------------------------------------------------------------------------
  appMode: 'scale',
  displayMode: 'notes',
  diagramsExpanded: false,
  popupState: null,
  
  setAppMode: (mode) => set({ appMode: mode }),
  setDisplayMode: (mode) => set({ displayMode: mode }),
  setDiagramsExpanded: (expanded) => set({ diagramsExpanded: expanded }),
  setPopupState: (state) => set({ popupState: state }),

  // --------------------------------------------------------------------------
  // Scale Slice
  // --------------------------------------------------------------------------
  scaleData: null,
  selectedRoot: 'C',
  selectedMode: 'major',
  selectedDiatonicChord: null,
  scaleLoading: false,
  scaleError: null,
  
  setScaleData: (data) => set({ scaleData: data }),
  setSelectedRoot: (root) => set({ selectedRoot: root }),
  setSelectedMode: (mode) => set({ selectedMode: mode }),
  setSelectedDiatonicChord: (chord) => set({ selectedDiatonicChord: chord }),
  
  fetchScale: async (root, mode) => {
    set({ scaleLoading: true, scaleError: null, selectedRoot: root, selectedMode: mode });
    try {
      const data = await apiClient.getScale(root, mode);
      set({ scaleData: data, selectedDiatonicChord: null, scaleLoading: false });
    } catch (err) {
      console.error('Failed to fetch scale:', err);
      set({ 
        scaleError: err instanceof Error ? err.message : 'Failed to load scale',
        scaleLoading: false 
      });
    }
  },
  
  clearScale: () => set({ 
    scaleData: null, 
    selectedDiatonicChord: null,
    scaleError: null 
  }),
  
  resetScale: () => set({ 
    selectedRoot: 'C', 
    selectedMode: 'major', 
    selectedDiatonicChord: null 
  }),

  // --------------------------------------------------------------------------
  // Chord Slice
  // --------------------------------------------------------------------------
  chordData: null,
  selectedChordRoot: null,
  selectedChordQuality: null,
  activeChordShapes: [],
  chordLoading: false,
  chordError: null,
  
  setChordData: (data) => set({ chordData: data }),
  setSelectedChordRoot: (root) => set({ selectedChordRoot: root }),
  setSelectedChordQuality: (quality) => set({ selectedChordQuality: quality }),
  setActiveChordShapes: (shapes) => set({ activeChordShapes: shapes }),
  
  toggleChordShape: (shape) => {
    set((state) => {
      if (state.activeChordShapes.includes(shape)) {
        return { activeChordShapes: state.activeChordShapes.filter(s => s !== shape) };
      } else {
        return { activeChordShapes: [...state.activeChordShapes, shape] };
      }
    });
  },
  
  fetchChord: async (root, quality) => {
    set({ chordLoading: true, chordError: null });
    try {
      const data = await apiClient.getChord(root, quality);
      set({ 
        chordData: data, 
        selectedChordRoot: root,
        selectedChordQuality: quality,
        activeChordShapes: [],
        chordLoading: false 
      });
      return data;
    } catch (err) {
      console.error('Failed to fetch chord:', err);
      set({ 
        chordError: err instanceof Error ? err.message : 'Failed to load chord',
        chordLoading: false 
      });
      return null;
    }
  },
  
  clearChord: () => set({ 
    chordData: null,
    selectedChordRoot: null,
    selectedChordQuality: null,
    activeChordShapes: [],
    chordError: null 
  }),
  
  resetChord: () => set({ 
    selectedChordRoot: null, 
    selectedChordQuality: null, 
    activeChordShapes: [] 
  }),

  // --------------------------------------------------------------------------
  // Chat Slice
  // --------------------------------------------------------------------------
  messages: loadMessages(),
  chatLoading: false,
  streamingStatus: null,
  threadId: loadThreadId(),
  
  addMessage: (message) => {
    set((state) => {
      const messages = [...state.messages, message];
      persistThread(state.threadId, messages);
      return { messages };
    });
  },

  setThreadId: (id) => {
    persistThread(id, get().messages);
    set({ threadId: id });
  },
  
  sendMessage: async (message) => {
    const { messages, threadId } = get();

    // Check if the last assistant message was interrupted (waiting for clarification)
    const lastAssistantMessage = [...messages].reverse().find(m => m.role === 'assistant');
    const isResumingFromInterrupt = lastAssistantMessage?.interrupted;

    // Add user message immediately
    const userMessage: ChatMessage = {
      id: generateMessageId(),
      role: 'user',
      content: message,
      timestamp: new Date(),
    };
    const streamingMsgId = generateMessageId();

    set((state) => {
      const msgs = [...state.messages, userMessage];
      persistThread(state.threadId, msgs);
      return { messages: msgs, chatLoading: true, streamingStatus: null };
    });

    const onStatus = (node: string) => set({ streamingStatus: nodeLabel(node) });

    const onToken = (text: string) => {
      set((state) => {
        const msgs = [...state.messages];
        const lastMsg = msgs[msgs.length - 1];

        if (lastMsg?.id === streamingMsgId) {
          msgs[msgs.length - 1] = { ...lastMsg, content: lastMsg.content + text };
        } else {
          // First token — create the streaming message
          msgs.push({
            id: streamingMsgId,
            role: 'assistant',
            content: text,
            timestamp: new Date(),
          });
        }

        return { messages: msgs, chatLoading: false, streamingStatus: null };
      });
    };

    try {
      const response = isResumingFromInterrupt
        ? await apiClient.streamResume(message, threadId, onStatus, onToken)
        : await apiClient.streamChat(message, messages, threadId, onStatus, onToken);

      // Handle interrupted response (agent asking a clarifying question)
      if (response.interrupted) {
        set((state) => {
          const msgs = [
            ...state.messages.filter(m => m.id !== streamingMsgId),
            {
              id: generateMessageId(),
              role: 'assistant' as const,
              content: response.interrupt_data?.clarifying_question || 'I need more information to help you.',
              timestamp: new Date(),
              interrupted: true,
              interruptData: response.interrupt_data,
            },
          ];
          persistThread(state.threadId, msgs);
          return { messages: msgs, chatLoading: false, streamingStatus: null };
        });

        return get().messages[get().messages.length - 1];
      }

      // Finalize the streaming message with metadata, or create if no tokens were streamed
      set((state) => {
        const msgs = [...state.messages];
        const idx = msgs.findIndex(m => m.id === streamingMsgId);
        const finalMessage: ChatMessage = {
          id: streamingMsgId,
          role: 'assistant',
          content: response.answer,
          timestamp: new Date(),
          scale: response.scale,
          chordChoices: response.chord_choices,
          visualizations: response.visualizations,
          outOfScope: response.out_of_scope,
          apiRequests: response.api_requests,
        };

        if (idx >= 0) {
          msgs[idx] = finalMessage;
        } else {
          msgs.push(finalMessage);
        }

        persistThread(state.threadId, msgs);
        return { messages: msgs, chatLoading: false, streamingStatus: null };
      });

      return get().messages.find(m => m.id === streamingMsgId) ?? null;
    } catch (err) {
      console.error('Chat error:', err);

      set((state) => {
        const msgs = [
          ...state.messages.filter(m => m.id !== streamingMsgId),
          {
            id: generateMessageId(),
            role: 'assistant' as const,
            content: 'Sorry, I encountered an error. Please make sure the backend is running.',
            timestamp: new Date(),
          },
        ];
        persistThread(state.threadId, msgs);
        return { messages: msgs, chatLoading: false, streamingStatus: null };
      });

      return null;
    }
  },
  
  resetChat: () => {
    const newThreadId = generateThreadId();
    persistThread(newThreadId, []);
    set({ messages: [], threadId: newThreadId });
  },

  // --------------------------------------------------------------------------
  // Chat Panel Slice
  // --------------------------------------------------------------------------
  chatWidth: 380,
  chatCollapsed: false,
  mobileSheetOpen: false,
  
  setChatWidth: (width) => set({ chatWidth: width }),
  toggleCollapsed: () => set((state) => ({ chatCollapsed: !state.chatCollapsed })),
  setMobileSheetOpen: (open) => set({ mobileSheetOpen: open }),
}));

// ============================================================================
// Selector Hooks (for performance - only re-render when specific state changes)
// ============================================================================

// Theme selectors
export const useDarkMode = () => useAppStore((state) => state.darkMode);
export const useToggleDarkMode = () => useAppStore((state) => state.toggleDarkMode);

// UI selectors
export const useAppMode = () => useAppStore((state) => state.appMode);
export const useDisplayMode = () => useAppStore((state) => state.displayMode);

// Scale selectors
export const useScaleData = () => useAppStore((state) => state.scaleData);
export const useSelectedScale = () => useAppStore((state) => ({
  root: state.selectedRoot,
  mode: state.selectedMode,
}));

// Chord selectors
export const useChordData = () => useAppStore((state) => state.chordData);
export const useSelectedChord = () => useAppStore((state) => ({
  root: state.selectedChordRoot,
  quality: state.selectedChordQuality,
}));
export const useActiveChordShapes = () => useAppStore((state) => state.activeChordShapes);

// Chat selectors
export const useChatMessages = () => useAppStore((state) => state.messages);
export const useChatLoading = () => useAppStore((state) => state.chatLoading);
export const useStreamingStatus = () => useAppStore((state) => state.streamingStatus);

// Chat panel selectors
export const useChatPanelState = () => useAppStore((state) => ({
  width: state.chatWidth,
  collapsed: state.chatCollapsed,
  mobileOpen: state.mobileSheetOpen,
}));
