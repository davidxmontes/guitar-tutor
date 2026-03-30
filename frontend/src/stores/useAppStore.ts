import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { apiClient, nodeLabel } from '../api/client';
import type {
  ScaleResponse,
  ChordResponse,
  DiatonicChord,
  DisplayMode,
  SongSearchResult,
  SongTracksResponse,
  TabDataResponse,
  ChordProResponse,
  HighlightedNote,
  TabBeat,
  TabMeasure,
  TuningInfo,
} from '../types';
import type { ChatMessage, UiContext } from '../types/chat';
import { midiTuningToNotes, matchTuningId } from '../utils/tuning';

// App mode type
export type AppMode = 'scale' | 'chord' | 'song';

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
    return parsed
      .filter((m: any) => m.content != null && m.content !== 'null')
      .map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }));
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

function getBeatsFromMeasure(measure?: TabMeasure): TabBeat[] {
  if (!measure) return [];
  const voices = measure.voices ?? [];
  if (voices.length === 0) return [];
  if (voices.length === 1) return voices[0]?.beats ?? [];

  let bestBeats: TabBeat[] = voices[0]?.beats ?? [];
  let bestScore = -1;
  for (const voice of voices) {
    const beats = voice?.beats ?? [];
    const score = beats.reduce((acc, beat) => {
      const noteCount = (beat.notes ?? []).filter((n) => !n.rest && !n.dead).length;
      return acc + noteCount;
    }, 0);
    if (score > bestScore) {
      bestScore = score;
      bestBeats = beats;
    }
  }
  return bestBeats;
}

function toHighlightedNotes(beat?: TabBeat): HighlightedNote[] {
  if (!beat) return [];
  const seen = new Set<string>();
  const highlights: HighlightedNote[] = [];
  for (const note of beat.notes ?? []) {
    if (note.rest || note.dead) continue;
    if (typeof note.string !== 'number' || typeof note.fret !== 'number') continue;
    const mappedString = note.string + 1;
    if (mappedString < 1 || mappedString > 6) continue;

    const key = `${mappedString}:${note.fret}`;
    if (seen.has(key)) continue;
    seen.add(key);
    highlights.push({ string: mappedString, fret: note.fret });
  }
  return highlights;
}

function firstPlayableBeatIndex(beats: TabBeat[]): number | undefined {
  for (let i = 0; i < beats.length; i += 1) {
    const notes = beats[i].notes ?? [];
    if (notes.some((n) => !n.rest && !n.dead)) return i;
  }
  return beats.length ? 0 : undefined;
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
  showScaleInChordMode: boolean;
  diagramsExpanded: boolean;
  popupState: PopupState | null;
  setAppMode: (mode: AppMode) => void;
  setDisplayMode: (mode: DisplayMode) => void;
  setShowScaleInChordMode: (show: boolean) => void;
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
  activeVoicings: string[];
  chordLoading: boolean;
  chordError: string | null;
  setChordData: (data: ChordResponse | null) => void;
  setSelectedChordRoot: (root: string | null) => void;
  setSelectedChordQuality: (quality: string | null) => void;
  setActiveVoicings: (shapes: string[]) => void;
  toggleVoicing: (shape: string) => void;
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
// Song Slice
// ============================================================================
interface SongSlice {
  // Search
  songSearchQuery: string;
  songSearchResults: SongSearchResult[];
  songSearchLoading: boolean;
  songSearchError: string | null;

  // Selected song & tracks
  selectedSong: SongSearchResult | null;
  songTracks: SongTracksResponse | null;
  selectedTrackIndex: number;

  // Tab data
  tabData: TabDataResponse | null;
  tabLoading: boolean;
  tabError: string | null;

  // ChordPro
  chordProData: ChordProResponse | null;
  chordProLoading: boolean;

  // View mode within song mode
  songViewMode: 'tab' | 'chords';

  // Bridge: highlighted notes on fretboard
  highlightedNotes: HighlightedNote[];
  playheadMeasureIndex: number;
  selectedBeatId: string | null;

  // Actions
  searchSongs: (query: string) => Promise<void>;
  selectSong: (song: SongSearchResult) => Promise<void>;
  selectSongById: (songId: number) => Promise<void>;
  selectTrack: (index: number) => Promise<void>;
  fetchChordPro: (songId: number) => Promise<void>;
  setSongViewMode: (mode: 'tab' | 'chords') => void;
  setHighlightedNotes: (notes: HighlightedNote[]) => void;
  setPlayheadMeasureIndex: (index: number) => void;
  setSelectedBeatId: (id: string | null) => void;
  focusMeasureBeat: (measureIndex: number, beatIndex?: number) => void;
  clearHighlightedNotes: () => void;
  clearSongState: () => void;
  backToSearch: () => void;
}

// ============================================================================
// Tuning Slice
// ============================================================================
interface TuningSlice {
  selectedTuning: string;
  customTuningNotes: string[] | null;
  availableTunings: TuningInfo[];
  setSelectedTuning: (tuning: string) => void;
  setCustomTuningNotes: (notes: string[] | null) => void;
  fetchTunings: () => Promise<void>;
}

// ============================================================================
// Combined Store Type
// ============================================================================
type AppStore = ThemeSlice & UISlice & ScaleSlice & ChordSlice & ChatSlice & ChatPanelSlice & SongSlice & TuningSlice;

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
  showScaleInChordMode: false,
  diagramsExpanded: false,
  popupState: null,
  
  setAppMode: (mode) => {
    const prev = get().appMode;
    // Reset tuning to standard when leaving song mode
    if (prev === 'song' && mode !== 'song') {
      set({ appMode: mode, selectedTuning: 'standard', customTuningNotes: null });
    } else {
      set({ appMode: mode });
    }
  },
  setDisplayMode: (mode) => set({ displayMode: mode }),
  setShowScaleInChordMode: (show) => set({ showScaleInChordMode: show }),
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
      const { selectedTuning, customTuningNotes } = get();
      const tuningNotes = customTuningNotes?.join(',');
      const data = await apiClient.getScale(root, mode, selectedTuning, tuningNotes);
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
  activeVoicings: [],
  chordLoading: false,
  chordError: null,
  
  setChordData: (data) => set({ chordData: data }),
  setSelectedChordRoot: (root) => set({ selectedChordRoot: root }),
  setSelectedChordQuality: (quality) => set({ selectedChordQuality: quality }),
  setActiveVoicings: (shapes) => set({ activeVoicings: shapes }),
  
  toggleVoicing: (shape) => {
    set((state) => {
      if (state.activeVoicings.includes(shape)) {
        return { activeVoicings: state.activeVoicings.filter(s => s !== shape) };
      } else {
        return { activeVoicings: [...state.activeVoicings, shape] };
      }
    });
  },
  
  fetchChord: async (root, quality) => {
    set({ chordLoading: true, chordError: null });
    try {
      const { selectedTuning, customTuningNotes } = get();
      const tuningNotes = customTuningNotes?.join(',');
      const data = await apiClient.getChord(root, quality, selectedTuning, tuningNotes);
      set({
        chordData: data,
        selectedChordRoot: root,
        selectedChordQuality: quality,
        activeVoicings: [],
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
    activeVoicings: [],
    chordError: null 
  }),
  
  resetChord: () => set({ 
    selectedChordRoot: null, 
    selectedChordQuality: null, 
    activeVoicings: [] 
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

    const buildUiContext = (): UiContext => {
      const state = get();
      return {
        app_mode: state.appMode,
        display_mode: state.displayMode,
        selected_tuning: state.selectedTuning,
        custom_tuning_notes: state.customTuningNotes,
        selected_scale: state.scaleData
          ? { root: state.selectedRoot, mode: state.selectedMode }
          : null,
        selected_chord: state.chordData
          ? { root: state.selectedChordRoot, quality: state.selectedChordQuality }
          : null,
        selected_song: state.selectedSong
          ? {
              song_id: state.selectedSong.song_id,
              artist: state.selectedSong.artist,
              title: state.selectedSong.title,
              has_chords: state.selectedSong.has_chords,
            }
          : null,
        selected_track_index: state.selectedTrackIndex,
        song_view_mode: state.songViewMode,
        playhead_measure_index: state.playheadMeasureIndex,
        selected_beat_id: state.selectedBeatId,
        highlighted_notes: state.highlightedNotes,
      };
    };

    const sendWithBootstrapRetry = async () => {
      const uiContext = buildUiContext();
      if (isResumingFromInterrupt) {
        try {
          return await apiClient.streamResume(message, threadId, uiContext, onStatus, onToken);
        } catch (err) {
          const code = (err as Error & { code?: string }).code;
          if (code !== 'THREAD_NOT_FOUND') throw err;

          console.warn('Resume thread missing on server, retrying with bootstrap history.');
          return apiClient.streamChat(
            message,
            threadId,
            uiContext,
            {
              requireExistingThread: false,
              bootstrapHistory: messages,
              deprecatedConversationHistory: messages,
            },
            onStatus,
            onToken,
          );
        }
      }

      const requireExistingThread = messages.length > 0;
      try {
        return await apiClient.streamChat(
          message,
          threadId,
          uiContext,
          {
            requireExistingThread,
          },
          onStatus,
          onToken,
        );
      } catch (err) {
        const code = (err as Error & { code?: string }).code;
        if (code !== 'THREAD_NOT_FOUND') throw err;

        // One-time bootstrap fallback from local persisted history.
        console.warn('Thread missing on server, retrying with bootstrap history.');
        return apiClient.streamChat(
          message,
          threadId,
          uiContext,
          {
            requireExistingThread: false,
            bootstrapHistory: messages,
            deprecatedConversationHistory: messages,
          },
          onStatus,
          onToken,
        );
      }
    };

    try {
      const response = await sendWithBootstrapRetry();

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
          content: response.answer || (idx >= 0 ? state.messages[idx].content : ''),
          timestamp: new Date(),
          scale: response.scale,
          chordChoices: response.chord_choices,
          visualizations: response.visualizations,
          outOfScope: response.out_of_scope,
          apiRequests: response.api_requests,
          actions: response.actions,
          memoryStatus: response.memory_status,
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
      const errCode = (err as Error & { code?: string }).code;
      const isThreadMissing = errCode === 'THREAD_NOT_FOUND';

      set((state) => {
        const msgs = [
          ...state.messages.filter(m => m.id !== streamingMsgId),
          {
            id: generateMessageId(),
            role: 'assistant' as const,
            content: isThreadMissing
              ? 'I lost server-side thread memory and could not restore this conversation. Please reset chat and try again.'
              : 'Sorry, I encountered an error. Please make sure the backend is running.',
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

  // --------------------------------------------------------------------------
  // Tuning Slice
  // --------------------------------------------------------------------------
  selectedTuning: 'standard',
  customTuningNotes: null,
  availableTunings: [],

  setSelectedTuning: (tuning) => set({ selectedTuning: tuning, customTuningNotes: null }),
  setCustomTuningNotes: (notes) => set({ customTuningNotes: notes }),
  fetchTunings: async () => {
    try {
      const data = await apiClient.getTunings();
      set({ availableTunings: data.tunings });

      // If currently in 'custom' tuning (e.g. song loaded before tunings arrived),
      // retry matching against the now-loaded tunings
      const { selectedTuning, customTuningNotes } = get();
      if (selectedTuning === 'custom' && customTuningNotes) {
        const matched = matchTuningId(customTuningNotes, data.tunings);
        if (matched) {
          set({ selectedTuning: matched, customTuningNotes: null });
        }
      }
    } catch (err) {
      console.error('Failed to fetch tunings:', err);
    }
  },

  // --------------------------------------------------------------------------
  // Song Slice
  // --------------------------------------------------------------------------
  songSearchQuery: '',
  songSearchResults: [],
  songSearchLoading: false,
  songSearchError: null,

  selectedSong: null,
  songTracks: null,
  selectedTrackIndex: 0,

  tabData: null,
  tabLoading: false,
  tabError: null,

  chordProData: null,
  chordProLoading: false,

  songViewMode: 'tab',
  highlightedNotes: [],
  playheadMeasureIndex: 0,
  selectedBeatId: null,

  searchSongs: async (query) => {
    set({ songSearchLoading: true, songSearchError: null, songSearchQuery: query });
    try {
      const data = await apiClient.searchSongs(query);
      set({ songSearchResults: data.results, songSearchLoading: false });
    } catch (err) {
      console.error('Failed to search songs:', err);
      set({
        songSearchError: err instanceof Error ? err.message : 'Failed to search songs',
        songSearchLoading: false,
      });
    }
  },

  selectSong: async (song) => {
    set({
      selectedSong: song,
      tabLoading: true,
      tabError: null,
      tabData: null,
      chordProData: null,
      selectedTrackIndex: 0,
      songViewMode: 'tab',
      highlightedNotes: [],
      playheadMeasureIndex: 0,
      selectedBeatId: null,
    });
    try {
      const tracksData = await apiClient.getSongTracks(song.song_id);
      set({ songTracks: tracksData });

      // Find first non-vocal, non-empty track
      const defaultTrack = tracksData.tracks.find(t => !t.is_vocal && !t.is_empty);
      const trackIdx = defaultTrack ? defaultTrack.index : 0;
      const selectedTrack = tracksData.tracks.find(t => t.index === trackIdx);

      // Auto-detect tuning from track
      if (selectedTrack?.tuning) {
        const notes = midiTuningToNotes(selectedTrack.tuning);
        const matched = matchTuningId(notes, get().availableTunings);
        if (matched) {
          set({ selectedTuning: matched, customTuningNotes: null });
        } else {
          set({ selectedTuning: 'custom', customTuningNotes: notes });
        }
      } else {
        set({ selectedTuning: 'standard', customTuningNotes: null });
      }

      const tabData = await apiClient.getTabData(song.song_id, trackIdx);
      set({
        tabData,
        selectedTrackIndex: trackIdx,
        tabLoading: false,
        playheadMeasureIndex: 0,
        selectedBeatId: null,
      });
    } catch (err) {
      console.error('Failed to load song:', err);
      set({
        tabError: err instanceof Error ? err.message : 'Failed to load song',
        tabLoading: false,
      });
    }
  },

  selectSongById: async (songId) => {
    const state = get();
    const fromResults = state.songSearchResults.find((s) => s.song_id === songId);
    if (fromResults) {
      await state.selectSong(fromResults);
      return;
    }

    set({
      tabLoading: true,
      tabError: null,
      tabData: null,
      chordProData: null,
      selectedTrackIndex: 0,
      songViewMode: 'tab',
      highlightedNotes: [],
      playheadMeasureIndex: 0,
      selectedBeatId: null,
    });

    try {
      const tracksData = await apiClient.getSongTracks(songId);
      const syntheticSong: SongSearchResult = {
        song_id: songId,
        artist: tracksData.artist,
        title: tracksData.title,
        has_chords: true,
        tracks: tracksData.tracks,
      };

      set({ selectedSong: syntheticSong, songTracks: tracksData });

      const defaultTrack = tracksData.tracks.find(t => !t.is_vocal && !t.is_empty);
      const trackIdx = defaultTrack ? defaultTrack.index : 0;
      await get().selectTrack(trackIdx);
    } catch (err) {
      console.error('Failed to load song by ID:', err);
      set({
        tabError: err instanceof Error ? err.message : 'Failed to load song',
        tabLoading: false,
      });
    }
  },

  selectTrack: async (index) => {
    const { selectedSong, songTracks, availableTunings } = get();
    if (!selectedSong) return;
    set({
      selectedTrackIndex: index,
      tabLoading: true,
      tabError: null,
      highlightedNotes: [],
      playheadMeasureIndex: 0,
      selectedBeatId: null,
    });

    // Auto-detect tuning from new track
    const track = songTracks?.tracks.find(t => t.index === index);
    if (track?.tuning) {
      const notes = midiTuningToNotes(track.tuning);
      const matched = matchTuningId(notes, availableTunings);
      if (matched) {
        set({ selectedTuning: matched, customTuningNotes: null });
      } else {
        set({ selectedTuning: 'custom', customTuningNotes: notes });
      }
    } else {
      set({ selectedTuning: 'standard', customTuningNotes: null });
    }

    try {
      const tabData = await apiClient.getTabData(selectedSong.song_id, index);
      set({
        tabData,
        tabLoading: false,
        playheadMeasureIndex: 0,
        selectedBeatId: null,
      });
    } catch (err) {
      console.error('Failed to load track:', err);
      set({
        tabError: err instanceof Error ? err.message : 'Failed to load track',
        tabLoading: false,
      });
    }
  },

  fetchChordPro: async (songId) => {
    set({ chordProLoading: true });
    try {
      const data = await apiClient.getChordPro(songId);
      set({ chordProData: data, chordProLoading: false });
    } catch {
      set({ chordProData: null, chordProLoading: false });
    }
  },

  setSongViewMode: (mode) => set({ songViewMode: mode }),
  setHighlightedNotes: (notes) => set({ highlightedNotes: notes }),
  setPlayheadMeasureIndex: (index) => set({ playheadMeasureIndex: index }),
  setSelectedBeatId: (id) => set({ selectedBeatId: id }),
  focusMeasureBeat: (measureIndex, beatIndex) => {
    const { tabData } = get();
    const measures = tabData?.tab_data?.measures ?? [];
    if (measures.length === 0) {
      set({ playheadMeasureIndex: 0, selectedBeatId: null, highlightedNotes: [] });
      return;
    }

    const clampedMeasure = Math.max(0, Math.min(measures.length - 1, measureIndex));
    const beats = getBeatsFromMeasure(measures[clampedMeasure]);
    if (beats.length === 0) {
      set({
        playheadMeasureIndex: clampedMeasure,
        selectedBeatId: null,
        highlightedNotes: [],
      });
      return;
    }

    const fallbackBeatIndex = firstPlayableBeatIndex(beats);
    const resolvedBeatIndex = Math.max(
      0,
      Math.min(beats.length - 1, beatIndex ?? fallbackBeatIndex ?? 0),
    );
    const beat = beats[resolvedBeatIndex];
    set({
      playheadMeasureIndex: clampedMeasure,
      selectedBeatId: `${clampedMeasure}:${resolvedBeatIndex}`,
      highlightedNotes: toHighlightedNotes(beat),
    });
  },
  clearHighlightedNotes: () => set({ highlightedNotes: [] }),

  clearSongState: () => set({
    songSearchQuery: '',
    songSearchResults: [],
    songSearchLoading: false,
    songSearchError: null,
    selectedSong: null,
    songTracks: null,
    selectedTrackIndex: 0,
    tabData: null,
    tabLoading: false,
    tabError: null,
    chordProData: null,
    chordProLoading: false,
    songViewMode: 'tab',
    highlightedNotes: [],
    playheadMeasureIndex: 0,
    selectedBeatId: null,
  }),

  backToSearch: () => set({
    selectedSong: null,
    songTracks: null,
    selectedTrackIndex: 0,
    tabData: null,
    tabLoading: false,
    tabError: null,
    chordProData: null,
    chordProLoading: false,
    highlightedNotes: [],
    playheadMeasureIndex: 0,
    selectedBeatId: null,
  }),
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
export const useShowScaleInChordMode = () => useAppStore((state) => state.showScaleInChordMode);

// Scale selectors
export const useScaleData = () => useAppStore((state) => state.scaleData);
export const useSelectedScale = () =>
  useAppStore(
    useShallow((state) => ({
      root: state.selectedRoot,
      mode: state.selectedMode,
    })),
  );

// Chord selectors
export const useChordData = () => useAppStore((state) => state.chordData);
export const useSelectedChord = () =>
  useAppStore(
    useShallow((state) => ({
      root: state.selectedChordRoot,
      quality: state.selectedChordQuality,
    })),
  );
export const useActiveVoicings = () => useAppStore((state) => state.activeVoicings);

// Chat selectors
export const useChatMessages = () => useAppStore((state) => state.messages);
export const useChatLoading = () => useAppStore((state) => state.chatLoading);
export const useStreamingStatus = () => useAppStore((state) => state.streamingStatus);

// Chat panel selectors
export const useChatPanelState = () =>
  useAppStore(
    useShallow((state) => ({
      width: state.chatWidth,
      collapsed: state.chatCollapsed,
      mobileOpen: state.mobileSheetOpen,
    })),
  );

// Song selectors
export const useSongSearch = () =>
  useAppStore(
    useShallow((state) => ({
      query: state.songSearchQuery,
      results: state.songSearchResults,
      loading: state.songSearchLoading,
      error: state.songSearchError,
    })),
  );
export const useSelectedSong = () => useAppStore((state) => state.selectedSong);
export const useSongTracks = () => useAppStore((state) => state.songTracks);
export const useTabData = () => useAppStore((state) => state.tabData);
export const useTabLoading = () => useAppStore((state) => state.tabLoading);
export const useTabError = () => useAppStore((state) => state.tabError);
export const useSongViewMode = () => useAppStore((state) => state.songViewMode);
export const useHighlightedNotes = () => useAppStore((state) => state.highlightedNotes);
export const usePlayheadMeasureIndex = () => useAppStore((state) => state.playheadMeasureIndex);
export const useSelectedBeatId = () => useAppStore((state) => state.selectedBeatId);

// Tuning selectors
export const useSelectedTuning = () => useAppStore((state) => state.selectedTuning);
export const useAvailableTunings = () => useAppStore((state) => state.availableTunings);
export const useCustomTuningNotes = () => useAppStore((state) => state.customTuningNotes);
