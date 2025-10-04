/**
 * NEW CACHE STRUCTURE DESIGN - Phase 1
 * 
 * This file documents the new state structure for thread caching
 * and proper loading state management.
 */

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
};

// ============================================================================
// State Interface - NEW STRUCTURE
// ============================================================================

type ChatState = {
  // Thread management
  selectedThreadId: string | null;
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
};

type ChatActions = {
  // Thread actions
  selectThread: (threadId: string | null) => void;
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
  
  // Message actions (simplified - work through cache)
  setMessages: (threadId: string, messages: BaseMessage[]) => void;
  appendMessage: (threadId: string, message: BaseMessage) => void;
  clearMessages: (threadId: string) => void;
  
  // NEW: Thread-scoped tool result actions
  setToolResult: (threadId: string, toolCallId: string, result: ToolResult) => void;
  updateToolStatus: (threadId: string, toolCallId: string, status: ToolResult['status']) => void;
  clearToolResults: (threadId: string) => void;
  
  // Streaming actions
  beginStream: (threadId?: string) => void;
  endStream: () => void;
  bufferAssistantText: (threadId: string, text: string) => void;
  flushPendingAssistant: (threadId: string) => void;
  
  // Utility
  getMessagesForThread: (threadId: string | null) => BaseMessage[];
  getToolResult: (threadId: string, toolCallId: string) => ToolResult | undefined;
  reset: () => void;
};

// ============================================================================
// Initial State
// ============================================================================

const initialState: ChatState = {
  selectedThreadId: null,
  threads: [],
  threadsLoading: false,
  threadsError: undefined,
  lastThreadsFetch: 0,
  threadCache: {},
  toolResultsByThread: {},
  isStreaming: false,
  pendingAssistant: null,
  streamingThreadId: null,
};

// ============================================================================
// Constants
// ============================================================================

const THREAD_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// ============================================================================
// Store Implementation
// ============================================================================

export const useChatStoreNew = create<ChatState & ChatActions>()(
  immer((set, get) => ({
    ...initialState,

    // ========================================================================
    // Thread Actions
    // ========================================================================

    selectThread: (threadId) => {
      set((state) => {
        state.selectedThreadId = threadId;
        
        // NEW: Cleanup streaming state if switching away from streaming thread
        if (state.isStreaming && state.streamingThreadId !== threadId) {
          state.isStreaming = false;
          state.pendingAssistant = null;
        }
      });
    },

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

        const threadList: ThreadListItem[] = threads.map((t: any) => ({
          thread_id: t.thread_id,
          status: 'idle' as ThreadStatus,
          metadata: {
            user_id: t.metadata?.user_id,
            repo: t.metadata?.repo,
            branch: t.metadata?.branch,
            created_at: t.created_at || t.metadata?.created_at,
            updated_at: t.updated_at || t.metadata?.updated_at,
            message_count: t.values?.messages?.length || 0,
          },
          last_message: undefined,
        }));

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
          };
        } else {
          state.threadCache[threadId].loadState = 'loading';
        }
      });
    },

    markThreadLoaded: (threadId, messages) => {
      set((state) => {
        state.threadCache[threadId] = {
          messages,
          loadState: 'loaded',
          lastFetched: Date.now(),
        };
      });
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
    // Message Actions (now work through cache)
    // ========================================================================

    setMessages: (threadId, messages) => {
      set((state) => {
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
      });
    },

    appendMessage: (threadId, message) => {
      set((state) => {
        if (!state.threadCache[threadId]) {
          state.threadCache[threadId] = {
            messages: [message],
            loadState: 'loaded',
            lastFetched: Date.now(),
          };
        } else {
          state.threadCache[threadId].messages.push(message);
        }
      });
    },

    clearMessages: (threadId) => {
      set((state) => {
        delete state.threadCache[threadId];
      });
    },

    // ========================================================================
    // NEW: Thread-Scoped Tool Result Actions
    // ========================================================================

    setToolResult: (threadId, toolCallId, result) => {
      set((state) => {
        if (!state.toolResultsByThread[threadId]) {
          state.toolResultsByThread[threadId] = {};
        }
        state.toolResultsByThread[threadId][toolCallId] = result;
      });
    },

    updateToolStatus: (threadId, toolCallId, status) => {
      set((state) => {
        if (state.toolResultsByThread[threadId]?.[toolCallId]) {
          state.toolResultsByThread[threadId][toolCallId].status = status;
        }
      });
    },

    clearToolResults: (threadId) => {
      set((state) => {
        delete state.toolResultsByThread[threadId];
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
        }

        state.pendingAssistant = null;
      });
    },

    // ========================================================================
    // Utility
    // ========================================================================

    getMessagesForThread: (threadId) => {
      if (!threadId) return [];
      return get().threadCache[threadId]?.messages || [];
    },

    getToolResult: (threadId, toolCallId) => {
      return get().toolResultsByThread[threadId]?.[toolCallId];
    },

    reset: () => {
      set(initialState);
    },
  }))
);

// ============================================================================
// Selectors (for optimized component subscriptions)
// ============================================================================

export const selectSelectedThread = (state: ChatState & ChatActions) => state.selectedThreadId;
export const selectThreads = (state: ChatState & ChatActions) => state.threads;
export const selectThreadsLoading = (state: ChatState & ChatActions) => state.threadsLoading;
export const selectIsStreaming = (state: ChatState & ChatActions) => state.isStreaming;
export const selectPendingAssistant = (state: ChatState & ChatActions) => state.pendingAssistant;

// NEW: Thread load state selector
export const selectThreadLoadState = (threadId: string) => (state: ChatState & ChatActions): ThreadLoadState => {
  return state.threadCache[threadId]?.loadState || 'idle';
};

// NEW: Messages selector with cache
export const selectMessagesForThread = (threadId: string | null) => (state: ChatState & ChatActions): BaseMessage[] => {
  if (!threadId) return [];
  return state.threadCache[threadId]?.messages || [];
};

// NEW: Tool result selector with thread scope
export const selectToolResultForThread = (threadId: string, toolCallId: string) => (state: ChatState & ChatActions): ToolResult | undefined => {
  return state.toolResultsByThread[threadId]?.[toolCallId];
};


