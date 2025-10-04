import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

// ============================================================================
// Types
// ============================================================================

export type ThreadStatus = 'idle' | 'executing' | 'completed' | 'error' | 'interrupted';

// NEW: Thread load states for tracking fetch status
export type ThreadLoadState = 'idle' | 'loading' | 'loaded' | 'error';

export type BaseMessage = {
  role: string;
  type?: string;
  content: any;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    name: string;
    args?: unknown;
  }>;
  additional_kwargs?: any;
};

export type ToolResult = {
  tool_call_id: string;
  content: any;
  status: 'executing' | 'completed' | 'error';
  startTime?: number;
};

export type ThreadListItem = {
  thread_id: string;
  status?: ThreadStatus;
  metadata?: {
    user_id?: string;
    repo?: string;
    branch?: string;
    mode?: string; // 'scratch' or 'repo'
    created_at?: string;
    updated_at?: string;
    message_count?: number;
  };
  last_message?: {
    content?: string;
    role?: string;
    timestamp?: string;
  };
};

export type PendingAssistant = {
  threadId: string;
  text: string;
  startedAt: number;
};

// NEW: Thread cache entry with metadata
export type ThreadCacheEntry = {
  messages: BaseMessage[];
  loadState: ThreadLoadState;
  lastFetched: number;
  error?: string;
  loadingStartTime?: number; // Track when loading started for minimum duration
};

// ============================================================================
// State Interface
// ============================================================================

type ChatState = {
  // Thread management
  threads: ThreadListItem[];
  threadsLoading: boolean;
  threadsError?: string;
  lastThreadsFetch: number;
  
  // NEW: Message cache with load states (replaces simple messagesByThread)
  threadCache: Record<string, ThreadCacheEntry>;
  
  // NEW: Tool results scoped per thread (replaces flat toolResultsById)
  toolResultsByThread: Record<string, Record<string, ToolResult>>;
  
  // Streaming state
  isStreaming: boolean;
  pendingAssistant: PendingAssistant | null;
  streamingThreadId: string | null;
  
  // DEPRECATED: Keep for backward compatibility during migration
  messagesByThread: Record<string, BaseMessage[]>;
  toolResultsById: Record<string, ToolResult>;
};

type ChatActions = {
  // Thread actions
  setThreads: (threads: ThreadListItem[]) => void;
  setThreadsLoading: (loading: boolean) => void;
  setThreadsError: (error: string | undefined) => void;
  updateThreadStatus: (threadId: string, status: ThreadStatus) => void;
  refreshThreads: () => Promise<void>;
  
  // NEW: Thread cache actions
  markThreadLoading: (threadId: string) => void;
  markThreadLoaded: (threadId: string, messages: BaseMessage[]) => void;
  markThreadError: (threadId: string, error: string) => void;
  shouldFetchThread: (threadId: string) => boolean;
  getThreadLoadState: (threadId: string) => ThreadLoadState;
  
  // Message actions
  setMessages: (threadId: string, messages: BaseMessage[]) => void;
  appendMessage: (threadId: string, message: BaseMessage) => void;
  clearMessages: (threadId: string) => void;
  
  // Tool result actions (NEW SIGNATURE - thread scoped)
  setToolResult: (threadId: string, toolCallId: string, result: ToolResult) => void;
  updateToolStatus: (threadId: string, toolCallId: string, status: ToolResult['status']) => void;
  clearToolResults: (threadId: string) => void;
  
  // DEPRECATED: Old tool result actions for backward compatibility
  setToolResultOld: (toolCallId: string, result: ToolResult) => void;
  updateToolStatusOld: (toolCallId: string, status: ToolResult['status']) => void;
  clearToolResultsOld: () => void;
  
  // Streaming actions
  beginStream: (threadId?: string) => void;
  endStream: () => void;
  bufferAssistantText: (threadId: string, text: string) => void;
  flushPendingAssistant: (threadId: string) => void;
  
  // Utility (NEW SIGNATURE - thread scoped)
  getMessagesForThread: (threadId: string | null) => BaseMessage[];
  getToolResult: (threadId: string, toolCallId: string) => ToolResult | undefined;
  getToolResultOld: (toolCallId: string) => ToolResult | undefined; // DEPRECATED
  reset: () => void;
};

// ============================================================================
// Initial State
// ============================================================================

const initialState: ChatState = {
  threads: [],
  threadsLoading: false,
  threadsError: undefined,
  lastThreadsFetch: 0,
  threadCache: {},
  toolResultsByThread: {},
  isStreaming: false,
  pendingAssistant: null,
  streamingThreadId: null,
  // DEPRECATED: Keep for backward compatibility
  messagesByThread: {},
  toolResultsById: {},
};

// ============================================================================
// Constants
// ============================================================================

const THREAD_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// ============================================================================
// Store
// ============================================================================

// ============================================================================
// Memoized Selectors (Export AFTER type definitions)
// ============================================================================
// Note: Additional selectors are defined at the end of the file

export const useChatStore = create<ChatState & ChatActions>()(
  immer((set, get) => ({
    ...initialState,

    // ========================================================================
    // Thread Actions
    // ========================================================================

    // REMOVED: selectThread - Now using URL-based routing (/c/[id])

    setThreads: (threads) => {
      set((state) => {
        state.threads = threads;
        state.lastThreadsFetch = Date.now();
      });
    },

    setThreadsLoading: (loading) => {
      set((state) => {
        state.threadsLoading = loading;
      });
    },

    setThreadsError: (error) => {
      set((state) => {
        state.threadsError = error;
      });
    },

    updateThreadStatus: (threadId, status) => {
      set((state) => {
        const thread = state.threads.find((t) => t.thread_id === threadId);
        if (thread) {
          thread.status = status;
        }
      });
    },

    refreshThreads: async () => {
      const now = Date.now();
      const lastFetch = get().lastThreadsFetch;
      
      // Debounce: don't fetch if we fetched within last 5 seconds
      if (now - lastFetch < 5000) {
        return;
      }

      set((state) => {
        state.threadsLoading = true;
        state.threadsError = undefined;
      });

      try {
        const response = await fetch('/api/threads', { cache: 'no-store' });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch threads: ${response.status}`);
        }

        const data = await response.json();
        const threads = data.threads || [];

        // Map all threads to the list format
        const threadList: ThreadListItem[] = threads.map((t: any) => {
          const updatedAt = t.updated_at || t.metadata?.updated_at;
          const timestamp = updatedAt ? new Date(updatedAt).getTime() : 0;
          const fifteenMinutesAgo = Date.now() - 15 * 60 * 1000;
          const isRecent = timestamp > fifteenMinutesAgo;

          return {
            thread_id: t.thread_id,
            status: 'idle' as ThreadStatus, // Status will be polled separately for recent threads
            metadata: {
              user_id: t.metadata?.user_id,
              repo: t.metadata?.repo,
              branch: t.metadata?.branch,
              mode: t.metadata?.mode, // ⚡ Preserve mode (scratch/repo)
              created_at: t.created_at || t.metadata?.created_at,
              updated_at: updatedAt,
              message_count: t.values?.messages?.length || 0,
              is_recent: isRecent, // Flag for status polling
            },
            last_message: undefined, // Will be populated from messages
          };
        });

        set((state) => {
          state.threads = threadList;
          state.threadsLoading = false;
          state.lastThreadsFetch = Date.now();
        });
      } catch (error: any) {
        console.error('🧵 [store] Failed to refresh threads:', error);
        set((state) => {
          state.threadsLoading = false;
          state.threadsError = error.message || 'Failed to load threads';
        });
      }
    },

    // ========================================================================
    // NEW: Thread Cache Actions
    // ========================================================================

    markThreadLoading: (threadId) => {
      set((state) => {
        if (!state.threadCache[threadId]) {
          state.threadCache[threadId] = {
            messages: [],
            loadState: 'loading',
            lastFetched: Date.now(),
            loadingStartTime: Date.now(), // Track when loading started
          };
        } else {
          state.threadCache[threadId].loadState = 'loading';
          state.threadCache[threadId].loadingStartTime = Date.now();
        }
      });
    },

    markThreadLoaded: (threadId, messages) => {
      const cache = get().threadCache[threadId];
      const loadingStartTime = cache?.loadingStartTime || Date.now();
      const elapsed = Date.now() - loadingStartTime;
      const MIN_LOADING_DURATION = 200; // Show loading for at least 200ms
      
      const finishLoading = () => {
        set((state) => {
          state.threadCache[threadId] = {
            messages,
            loadState: 'loaded',
            lastFetched: Date.now(),
          };
        });
      };
      
      if (elapsed < MIN_LOADING_DURATION) {
        // Delay marking as loaded to ensure skeleton is visible
        setTimeout(finishLoading, MIN_LOADING_DURATION - elapsed);
      } else {
        finishLoading();
      }
    },

    markThreadError: (threadId, error) => {
      set((state) => {
        if (!state.threadCache[threadId]) {
          state.threadCache[threadId] = {
            messages: [],
            loadState: 'error',
            lastFetched: Date.now(),
            error,
          };
        } else {
          state.threadCache[threadId].loadState = 'error';
          state.threadCache[threadId].error = error;
        }
      });
    },

    shouldFetchThread: (threadId) => {
      const cache = get().threadCache[threadId];
      
      // No cache entry - should fetch
      if (!cache) return true;
      
      // Error state - allow retry after 30 seconds
      if (cache.loadState === 'error') {
        return Date.now() - cache.lastFetched > 30000;
      }
      
      // Currently loading - don't fetch again
      if (cache.loadState === 'loading') return false;
      
      // Loaded but stale (older than TTL) - should fetch
      if (cache.loadState === 'loaded') {
        return Date.now() - cache.lastFetched > THREAD_CACHE_TTL;
      }
      
      // Idle state - should fetch
      return true;
    },

    getThreadLoadState: (threadId) => {
      return get().threadCache[threadId]?.loadState || 'idle';
    },

    // ========================================================================
    // Message Actions
    // ========================================================================

    setMessages: (threadId, messages) => {
      set((state) => {
        // NEW: Update cache structure
        if (!state.threadCache[threadId]) {
          state.threadCache[threadId] = {
            messages,
            loadState: 'loaded',
            lastFetched: Date.now(),
          };
        } else {
          // Only update if messages actually changed
          const existing = state.threadCache[threadId].messages;
          if (existing.length !== messages.length || 
              existing[existing.length - 1]?.content !== messages[messages.length - 1]?.content) {
            state.threadCache[threadId].messages = messages;
            state.threadCache[threadId].lastFetched = Date.now();
          }
        }
        
        // DEPRECATED: Maintain backward compatibility
        state.messagesByThread[threadId] = messages;
      });
    },

    appendMessage: (threadId, message) => {
      set((state) => {
        // NEW: Update cache structure
        if (!state.threadCache[threadId]) {
          state.threadCache[threadId] = {
            messages: [message],
            loadState: 'loaded',
            lastFetched: Date.now(),
          };
        } else {
          state.threadCache[threadId].messages.push(message);
        }
        
        // DEPRECATED: Maintain backward compatibility
        if (!state.messagesByThread[threadId]) {
          state.messagesByThread[threadId] = [];
        }
        state.messagesByThread[threadId].push(message);
      });
    },

    clearMessages: (threadId) => {
      set((state) => {
        // NEW: Clear cache entry
        delete state.threadCache[threadId];
        
        // DEPRECATED: Maintain backward compatibility
        delete state.messagesByThread[threadId];
      });
    },

    // ========================================================================
    // Tool Result Actions (NEW: Thread-scoped)
    // ========================================================================

    setToolResult: (threadId, toolCallId, result) => {
      set((state) => {
        // NEW: Thread-scoped storage
        if (!state.toolResultsByThread[threadId]) {
          state.toolResultsByThread[threadId] = {};
        }
        state.toolResultsByThread[threadId][toolCallId] = result;
        
        // DEPRECATED: Maintain backward compatibility
        state.toolResultsById[toolCallId] = result;
      });
    },

    updateToolStatus: (threadId, toolCallId, status) => {
      set((state) => {
        // NEW: Thread-scoped update
        if (state.toolResultsByThread[threadId]?.[toolCallId]) {
          state.toolResultsByThread[threadId][toolCallId].status = status;
        }
        
        // DEPRECATED: Maintain backward compatibility
        if (state.toolResultsById[toolCallId]) {
          state.toolResultsById[toolCallId].status = status;
        }
      });
    },

    clearToolResults: (threadId) => {
      set((state) => {
        // NEW: Clear only for specific thread
        delete state.toolResultsByThread[threadId];
        
        // DEPRECATED: Don't clear global map for backward compatibility
      });
    },

    // DEPRECATED: Old tool result actions for backward compatibility
    setToolResultOld: (toolCallId, result) => {
      set((state) => {
        state.toolResultsById[toolCallId] = result;
      });
    },

    updateToolStatusOld: (toolCallId, status) => {
      set((state) => {
        if (state.toolResultsById[toolCallId]) {
          state.toolResultsById[toolCallId].status = status;
        }
      });
    },

    clearToolResultsOld: () => {
      set((state) => {
        state.toolResultsById = {};
      });
    },

    // ========================================================================
    // Streaming Actions
    // ========================================================================

    beginStream: (threadId) => {
      set((state) => {
        state.isStreaming = true;
        state.streamingThreadId = threadId || null;
        state.pendingAssistant = null;
      });
    },

    endStream: () => {
      set((state) => {
        state.isStreaming = false;
        state.streamingThreadId = null;
        
        // Flush any pending assistant text
        if (state.pendingAssistant) {
          const { threadId, text } = state.pendingAssistant;
          if (text.trim()) {
            // NEW: Update cache structure
            if (!state.threadCache[threadId]) {
              state.threadCache[threadId] = {
                messages: [],
                loadState: 'loaded',
                lastFetched: Date.now(),
              };
            }
            state.threadCache[threadId].messages.push({
              role: 'assistant',
              type: 'ai',
              content: text,
            });
            
            // DEPRECATED: Maintain backward compatibility
            if (!state.messagesByThread[threadId]) {
              state.messagesByThread[threadId] = [];
            }
            state.messagesByThread[threadId].push({
              role: 'assistant',
              type: 'ai',
              content: text,
            });
          }
          state.pendingAssistant = null;
        }
      });
    },

    bufferAssistantText: (threadId, text) => {
      set((state) => {
        if (!state.pendingAssistant || state.pendingAssistant.threadId !== threadId) {
          state.pendingAssistant = {
            threadId,
            text,
            startedAt: Date.now(),
          };
        } else {
          // Replace the entire text (LangGraph streams the full content, not deltas)
          state.pendingAssistant.text = text;
        }
      });
    },

    flushPendingAssistant: (threadId) => {
      set((state) => {
        if (!state.pendingAssistant || state.pendingAssistant.threadId !== threadId) {
          return;
        }

        const { text } = state.pendingAssistant;
        if (text.trim()) {
          // NEW: Update cache structure
          if (!state.threadCache[threadId]) {
            state.threadCache[threadId] = {
              messages: [],
              loadState: 'loaded',
              lastFetched: Date.now(),
            };
          }

          const messages = state.threadCache[threadId].messages;
          const lastMsg = messages[messages.length - 1];
          
          if (lastMsg && lastMsg.role === 'assistant' && !lastMsg.tool_calls?.length) {
            lastMsg.content = text;
          } else {
            messages.push({
              role: 'assistant',
              type: 'ai',
              content: text,
            });
          }
          
          // DEPRECATED: Maintain backward compatibility
          if (!state.messagesByThread[threadId]) {
            state.messagesByThread[threadId] = [];
          }
          const legacyMessages = state.messagesByThread[threadId];
          const legacyLastMsg = legacyMessages[legacyMessages.length - 1];
          if (legacyLastMsg && legacyLastMsg.role === 'assistant' && !legacyLastMsg.tool_calls?.length) {
            legacyLastMsg.content = text;
          } else {
            legacyMessages.push({
              role: 'assistant',
              type: 'ai',
              content: text,
            });
          }
        }

        state.pendingAssistant = null;
      });
    },

    // ========================================================================
    // Utility
    // ========================================================================

    getMessagesForThread: (threadId) => {
      if (!threadId) return [];
      // NEW: Use cache structure
      return get().threadCache[threadId]?.messages || [];
    },

    getToolResult: (threadId, toolCallId) => {
      // NEW: Thread-scoped lookup
      return get().toolResultsByThread[threadId]?.[toolCallId];
    },

    getToolResultOld: (toolCallId) => {
      // DEPRECATED: Old flat lookup
      return get().toolResultsById[toolCallId];
    },

    reset: () => {
      set(initialState);
    },
  }))
);

// ============================================================================
// Selectors (for optimized component subscriptions)
// ============================================================================

export const selectThreads = (state: ChatState & ChatActions) => state.threads;
export const selectThreadsLoading = (state: ChatState & ChatActions) => state.threadsLoading;
export const selectIsStreaming = (state: ChatState & ChatActions) => state.isStreaming;
export const selectPendingAssistant = (state: ChatState & ChatActions) => state.pendingAssistant;

// Memoized selector for messages - returns empty array reference for consistency
const EMPTY_MESSAGES: BaseMessage[] = [];

// REMOVED: selectMessagesForSelectedThread - No longer using selectedThreadId state

// NEW: Cache-aware selectors
export const selectThreadLoadState = (threadId: string) => (state: ChatState & ChatActions): ThreadLoadState => {
  return state.threadCache[threadId]?.loadState || 'idle';
};

export const selectMessagesForThread = (threadId: string | null) => (state: ChatState & ChatActions): BaseMessage[] => {
  if (!threadId) return EMPTY_MESSAGES;
  return state.threadCache[threadId]?.messages || EMPTY_MESSAGES;
};

export const selectToolResultForThread = (threadId: string, toolCallId: string) => (state: ChatState & ChatActions): ToolResult | undefined => {
  return state.toolResultsByThread[threadId]?.[toolCallId];
};

export const selectThreadById = (threadId: string) => (state: ChatState & ChatActions) => {
  return state.threads.find((t) => t.thread_id === threadId);
};
