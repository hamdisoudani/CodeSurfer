import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

// ============================================================================
// Types
// ============================================================================

export type ThreadStatus = 'idle' | 'executing' | 'completed' | 'error' | 'interrupted';

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

// ============================================================================
// State Interface
// ============================================================================

type ChatState = {
  // Thread management
  selectedThreadId: string | null;
  threads: ThreadListItem[];
  threadsLoading: boolean;
  threadsError?: string;
  lastThreadsFetch: number;
  
  // Message storage (keyed by thread_id)
  messagesByThread: Record<string, BaseMessage[]>;
  
  // Tool results (flat map for quick lookup)
  toolResultsById: Record<string, ToolResult>;
  
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
  
  // Message actions
  setMessages: (threadId: string, messages: BaseMessage[]) => void;
  appendMessage: (threadId: string, message: BaseMessage) => void;
  clearMessages: (threadId: string) => void;
  
  // Tool result actions
  setToolResult: (toolCallId: string, result: ToolResult) => void;
  updateToolStatus: (toolCallId: string, status: ToolResult['status']) => void;
  clearToolResults: () => void;
  
  // Streaming actions
  beginStream: (threadId?: string) => void;
  endStream: () => void;
  bufferAssistantText: (threadId: string, text: string) => void;
  flushPendingAssistant: (threadId: string) => void;
  
  // Utility
  getMessagesForThread: (threadId: string | null) => BaseMessage[];
  getToolResult: (toolCallId: string) => ToolResult | undefined;
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
  messagesByThread: {},
  toolResultsById: {},
  isStreaming: false,
  pendingAssistant: null,
  streamingThreadId: null,
};

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

    selectThread: (threadId) => {
      set((state) => {
        state.selectedThreadId = threadId;
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
    // Message Actions
    // ========================================================================

    setMessages: (threadId, messages) => {
      set((state) => {
        // Only update if messages actually changed (prevents unnecessary re-renders)
        const existing = state.messagesByThread[threadId];
        if (!existing || existing.length !== messages.length || 
            existing[existing.length - 1]?.content !== messages[messages.length - 1]?.content) {
          state.messagesByThread[threadId] = messages;
        }
      });
    },

    appendMessage: (threadId, message) => {
      set((state) => {
        if (!state.messagesByThread[threadId]) {
          state.messagesByThread[threadId] = [];
        }
        state.messagesByThread[threadId].push(message);
      });
    },

    clearMessages: (threadId) => {
      set((state) => {
        delete state.messagesByThread[threadId];
      });
    },

    // ========================================================================
    // Tool Result Actions
    // ========================================================================

    setToolResult: (toolCallId, result) => {
      set((state) => {
        state.toolResultsById[toolCallId] = result;
      });
    },

    updateToolStatus: (toolCallId, status) => {
      set((state) => {
        if (state.toolResultsById[toolCallId]) {
          state.toolResultsById[toolCallId].status = status;
        }
      });
    },

    clearToolResults: () => {
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
          if (!state.messagesByThread[threadId]) {
            state.messagesByThread[threadId] = [];
          }

          // Check if last message is assistant and replace it, otherwise append
          const messages = state.messagesByThread[threadId];
          const lastMsg = messages[messages.length - 1];
          
          if (lastMsg && lastMsg.role === 'assistant' && !lastMsg.tool_calls?.length) {
            // Update existing assistant message
            lastMsg.content = text;
          } else {
            // Append new assistant message
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
      return get().messagesByThread[threadId] || [];
    },

    getToolResult: (toolCallId) => {
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

export const selectSelectedThread = (state: ChatState & ChatActions) => state.selectedThreadId;
export const selectThreads = (state: ChatState & ChatActions) => state.threads;
export const selectThreadsLoading = (state: ChatState & ChatActions) => state.threadsLoading;
export const selectIsStreaming = (state: ChatState & ChatActions) => state.isStreaming;
export const selectPendingAssistant = (state: ChatState & ChatActions) => state.pendingAssistant;

// Memoized selector for messages - returns empty array reference for consistency
const EMPTY_MESSAGES: BaseMessage[] = [];

export const selectMessagesForSelectedThread = (state: ChatState & ChatActions): BaseMessage[] => {
  const threadId = state.selectedThreadId;
  if (!threadId) return EMPTY_MESSAGES;
  return state.messagesByThread[threadId] || EMPTY_MESSAGES;
};

export const selectThreadById = (threadId: string) => (state: ChatState & ChatActions) => {
  return state.threads.find((t) => t.thread_id === threadId);
};
