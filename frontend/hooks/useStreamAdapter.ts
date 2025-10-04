import { useEffect, useRef, useCallback, useState } from 'react';
import { useStream } from '@langchain/langgraph-sdk/react';
import { useChatStore } from '@/store/chat';
import { toast } from 'sonner';

interface UseStreamAdapterOptions {
  threadId: string | null; // Thread ID from URL params
  session: any;
  status: string;
  baseAgentUrl: string;
  currentWorkspaceId?: string;
  onNewThreadCreated?: (threadId: string) => void; // Callback when new thread is created
}

/**
 * Stream adapter that bridges LangGraph's useStream hook with our Zustand store.
 * Handles message buffering, tool results, and thread lifecycle.
 */
export function useStreamAdapter({
  threadId,
  session,
  status,
  baseAgentUrl,
  currentWorkspaceId,
  onNewThreadCreated,
}: UseStreamAdapterOptions) {
  const isStreaming = useChatStore((s) => s.isStreaming);
  const pendingAssistant = useChatStore((s) => s.pendingAssistant);
  
  const {
    beginStream,
    endStream,
    bufferAssistantText,
    flushPendingAssistant,
    setMessages,
    appendMessage,
    setToolResult,
    refreshThreads,
  } = useChatStore();

  // Build headers and track readiness
  const [headersReady, setHeadersReady] = useState(false);
  const defaultHeaders = useRef<Record<string, string>>({});
  
  useEffect(() => {
    const token = session?.access_token;
    
    if (status === 'authenticated' && token) {
      const headers: Record<string, string> = {
        'authorization': `Bearer ${token}`,
      };
      
      if (currentWorkspaceId) {
        headers['x-workspace-id'] = currentWorkspaceId;
      }
      
      defaultHeaders.current = headers;
      setHeadersReady(true);
    } else {
      setHeadersReady(false);
    }
  }, [session?.access_token, currentWorkspaceId, status]);

  // Initialize LangGraph stream only when headers are ready
  const streamConfig = headersReady && status === 'authenticated' ? {
    apiUrl: baseAgentUrl,
    assistantId: 'agent',
    threadId: threadId || undefined,
    messagesKey: 'messages',
    reconnectOnMount: true,
    defaultHeaders: defaultHeaders.current,
    onThreadId: (tid: string) => {
      console.log('🆕 [useStreamAdapter] New thread created:', tid);
      
      // When a brand new conversation is created, refresh threads list
      if (!threadId) {
        refreshThreads();
        
        // Notify parent component about the new thread (for navigation)
        if (onNewThreadCreated) {
          console.log('📢 [useStreamAdapter] Calling onNewThreadCreated callback');
          onNewThreadCreated(tid);
        }
      }
    },
  } : null;

  const stream = useStream(streamConfig || {
    apiUrl: baseAgentUrl,
    assistantId: 'agent',
    messagesKey: 'messages',
    reconnectOnMount: true,
  }) as any; // Type assertion due to LangGraph SDK type limitations

  // Track last processed message index to avoid reprocessing
  const lastProcessedIndex = useRef(0);
  const lastThreadId = useRef<string | null>(null);
  const hasLoadedInitialMessages = useRef(false);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSyncTime = useRef<number>(0);

  // Sync stream.messages directly to store - LangGraph handles streaming internally
  // THROTTLED to prevent UI freezing during rapid updates
  useEffect(() => {
    // Don't process messages until headers are ready
    if (!headersReady || status !== 'authenticated') {
      return;
    }

    const streamMessages = stream.messages || [];
    const streamThreadId = stream.threadId || threadId;

    // NEW: Track thread changes but DON'T clear messages (they're cached now!)
    if (streamThreadId !== lastThreadId.current) {
      const previousThreadId = lastThreadId.current;
      lastThreadId.current = streamThreadId || null;
      
      console.log('🔄 [useStreamAdapter] Thread changed:', {
        from: previousThreadId,
        to: streamThreadId,
        streamMessageCount: streamMessages.length,
        streamIsLoading: stream.isLoading
      });
      
      // NEW: Show loading state immediately when switching threads (unless already cached)
      if (streamThreadId) {
        const store = useChatStore.getState();
        const shouldFetch = store.shouldFetchThread(streamThreadId);
        
        if (shouldFetch) {
          console.log('📋 [useStreamAdapter] Marking thread as loading:', streamThreadId);
          store.markThreadLoading(streamThreadId);
        } else {
          console.log('📋 [useStreamAdapter] Thread already cached:', streamThreadId);
        }
      }
    }

    const currentThreadId = streamThreadId;
    if (!currentThreadId) return;
    
    // NEW: If no messages yet from stream, check if we should fetch
    if (streamMessages.length === 0) {
      const shouldFetch = useChatStore.getState().shouldFetchThread(currentThreadId);
      if (!shouldFetch) {
        // Thread is already cached or loading, no need to wait
        return;
      }
      // Otherwise continue to wait for stream messages
      return;
    }

    // Throttle updates during streaming to prevent UI freezing
    // Allow immediate updates if: not streaming, or enough time has passed
    const now = Date.now();
    const timeSinceLastSync = now - lastSyncTime.current;
    const shouldThrottle = stream.isLoading && timeSinceLastSync < 200; // 200ms throttle during streaming (increased for better performance)

    const syncMessages = () => {
      const formattedMessages: any[] = [];
      const toolResults: Record<string, any> = {};
      
      // Batch process messages for better performance
      const messagesLength = streamMessages.length;
      for (let i = 0; i < messagesLength; i++) {
        const msg = streamMessages[i];
        const msgType = msg.type || msg._getType?.();
        
        if (msgType === 'tool' && msg.tool_call_id) {
          // Store tool result
          toolResults[msg.tool_call_id] = {
            tool_call_id: msg.tool_call_id,
            content: msg.content,
            status: 'completed',
          };
        } else if (msgType === 'ai') {
          // AI message - LangGraph updates content as it streams
          const aiMsg: any = {
            role: 'assistant',
            type: 'ai',
            content: msg.content || '',
          };
          
          // Add tool calls if present
          if (msg.tool_calls && msg.tool_calls.length > 0) {
            aiMsg.tool_calls = msg.tool_calls;
          }
          
          formattedMessages.push(aiMsg);
        } else if (msgType === 'human') {
          // Human message
          formattedMessages.push({
            role: 'user',
            type: 'human',
            content: msg.content || '',
          });
        }
      }

      // Batch all state updates together
      const store = useChatStore.getState();
      store.setMessages(currentThreadId, formattedMessages);
      
      // NEW: Mark thread as loaded after successful message sync
      store.markThreadLoaded(currentThreadId, formattedMessages);
      
      console.log('💾 [useStreamAdapter] Synced messages:', {
        threadId: currentThreadId,
        messageCount: formattedMessages.length,
        toolResultCount: Object.keys(toolResults).length
      });
      
      // NEW: Set all tool results with thread scope
      for (const [id, result] of Object.entries(toolResults)) {
        store.setToolResult(currentThreadId, id, result);
      }

      lastSyncTime.current = Date.now();
    };

    if (shouldThrottle) {
      // Clear any pending sync
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
      // Schedule sync after throttle period
      syncTimeoutRef.current = setTimeout(syncMessages, 200);
    } else {
      // Sync immediately if not throttled
      syncMessages();
    }

    // Cleanup: ensure final sync when streaming ends
    return () => {
      if (syncTimeoutRef.current && !stream.isLoading) {
        clearTimeout(syncTimeoutRef.current);
        syncMessages();
      }
    };
  }, [stream.messages, stream.threadId, threadId, headersReady, status, stream.isLoading]);

  // We rely on onThreadId callback to select newly created threads

  // No need for periodic flushing - LangGraph handles streaming updates

  // Sync streaming state with store
  useEffect(() => {
    if (stream.isLoading && !isStreaming) {
      beginStream(threadId || undefined);
    } else if (!stream.isLoading && isStreaming) {
      endStream();
    }
  }, [stream.isLoading, isStreaming, threadId]);

  // Handle stream errors
  useEffect(() => {
    if (stream.error) {
      console.error('🌊 [stream] Error:', stream.error);
      
      // NEW: Mark thread as errored
      if (threadId) {
        useChatStore.getState().markThreadError(
          threadId, 
          stream.error.message || 'Stream connection failed'
        );
      }
      
      // NEW: Mark executing tools as failed (thread-scoped)
      if (threadId) {
        const state = useChatStore.getState();
        const threadTools = state.toolResultsByThread[threadId];
        if (threadTools) {
          Object.entries(threadTools).forEach(([id, result]) => {
            if (result.status === 'executing') {
              state.updateToolStatus(threadId, id, 'error');
            }
          });
        }
      }
      
      endStream();
      
      toast.error('Stream error', {
        description: stream.error.message || 'Connection failed',
      });
    }
  }, [stream.error, threadId]);

  // Submit message function
  const submitMessage = useCallback(
    async (text: string, contextData?: any, metadata?: any) => {
      if (!text.trim()) return false;

      // Validate auth
      if (status !== 'authenticated' || !session?.access_token) {
        toast.error('Authentication required', {
          description: 'Please sign in to continue.',
        });
        return false;
      }

      try {
        // Begin streaming
        beginStream(threadId || undefined);

        // Submit to LangGraph
        const input = { messages: [{ role: 'user', content: text }], context: contextData };
        const options: any = { config: { recursion_limit: 1000 } };
        
        if (metadata) {
          options.metadata = metadata;
        }
        
        if (threadId) {
          options.threadId = threadId;
        }

        await stream.submit(input, options);
        return true;
      } catch (error: any) {
        console.error('📤 [stream] Submit error:', error);
        endStream();

        const errorMessage = error.message || 'Failed to send message.';
        if (errorMessage.includes('Repository must be indexed')) {
          toast.error('Repository not ready', {
            description: 'Please wait for repository indexing to complete.',
          });
        } else if (errorMessage.includes('Workspace context required')) {
          toast.error('Workspace required', {
            description: 'Please select a repository and branch to continue.',
          });
        } else {
          toast.error('Failed to send message', {
            description: errorMessage,
          });
        }

        return false;
      }
    },
    [threadId, session, status, stream]
  );

  return {
    submitMessage,
    isLoading: stream.isLoading,
    isInitializing: !headersReady || status !== 'authenticated',
    error: stream.error,
  };
}
