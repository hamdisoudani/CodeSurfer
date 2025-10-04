"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deriveStatusFromState, ThreadListItem, ThreadStatus } from "@/lib/threads";

// Cache for thread states with timestamps
interface ThreadStateCache {
  [threadId: string]: {
    state: any;
    timestamp: number;
    status: ThreadStatus;
  }
}

const CACHE_DURATION = 30000; // 30 seconds cache
const MAX_BATCH_SIZE = 50; // Limit batch size for performance

type UseThreadsResult = {
  threads: ThreadListItem[];
  loading: boolean;
  error?: string;
  selectedThreadId: string | null;
  setSelectedThreadId: (id: string | null) => void;
  refresh: () => Promise<void>;
  forceRefresh: () => Promise<void>;
  getStatus: (id: string) => ThreadStatus;
};

export function useThreads(): UseThreadsResult {
  const [threads, setThreads] = useState<ThreadListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);

  // Intelligent cache for thread states
  const cacheRef = useRef<ThreadStateCache>({});
  
  // Local cache of derived statuses to avoid recomputing frequently
  const statusMapRef = useRef<Record<string, ThreadStatus>>({});

  // Check if cached state is still valid
  const isCacheValid = useCallback((threadId: string): boolean => {
    const cached = cacheRef.current[threadId];
    if (!cached) return false;
    return Date.now() - cached.timestamp < CACHE_DURATION;
  }, []);

  // Batch fetch thread states for multiple threads
  const fetchThreadStates = useCallback(async (threadIds: string[]) => {
    if (threadIds.length === 0) return {};

    console.log(`📦 Batching ${threadIds.length} thread state requests`);
    
    try {
      // Try batch API first (will implement this endpoint)
      const response = await fetch('/api/threads/batch-states', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_ids: threadIds.slice(0, MAX_BATCH_SIZE) })
      });

      if (response.ok) {
        const batchResult = await response.json();
        console.log(`✅ Batch API returned ${Object.keys(batchResult.states || {}).length} states`);
        return batchResult.states || {};
      }
    } catch (error) {
      console.warn('📦 Batch API failed, falling back to individual requests:', error);
    }

    // Fallback: individual requests (but with intelligent limiting)
    console.log(`🔄 Fallback: Making individual requests for ${Math.min(threadIds.length, 10)} threads`);
    const limitedIds = threadIds.slice(0, 10); // Limit to 10 to prevent overload
    
    const states: Record<string, any> = {};
    const results = await Promise.allSettled(limitedIds.map(async (threadId) => {
      try {
        const rs = await fetch(`/api/threads/${encodeURIComponent(threadId)}/state`, { 
          cache: "no-store",
          signal: AbortSignal.timeout(5000) // 5s timeout
        });
        if (rs.ok) {
          const state = await rs.json();
          return { threadId, state };
        }
        return { threadId, state: null };
      } catch {
        return { threadId, state: null };
      }
    }));

    results.forEach((result) => {
      if (result.status === 'fulfilled' && result.value) {
        states[result.value.threadId] = result.value.state;
      }
    });

    return states;
  }, []);

  const getStatus = useCallback((id: string): ThreadStatus => {
    return statusMapRef.current[id] || 'idle';
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    
    try {
      console.log('🔄 Refreshing threads...');
      
      // 1. Get basic thread list
      const res = await fetch("/api/threads", { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load threads (${res.status})`);
      const data = await res.json();
      const list: any[] = data.threads ?? [];

      console.log(`📋 Found ${list.length} threads`);

      // 2. Identify which threads need state updates
      const threadsNeedingStates: string[] = [];
      const cachedStates: Record<string, any> = {};

      list.forEach(t => {
        if (isCacheValid(t.thread_id)) {
          // Use cached state
          cachedStates[t.thread_id] = cacheRef.current[t.thread_id].state;
          console.log(`💾 Using cached state for thread: ${t.thread_id}`);
        } else {
          // Need to fetch
          threadsNeedingStates.push(t.thread_id);
        }
      });

      console.log(`🔍 Need to fetch states for ${threadsNeedingStates.length} threads`);
      console.log(`💾 Using cached states for ${Object.keys(cachedStates).length} threads`);

      // 3. Batch fetch only threads that need updates
      const freshStates = threadsNeedingStates.length > 0 
        ? await fetchThreadStates(threadsNeedingStates)
        : {};

      // 4. Combine cached and fresh states
      const allStates = { ...cachedStates, ...freshStates };

      // 5. Update cache with fresh states
      Object.entries(freshStates).forEach(([threadId, state]) => {
        const status = deriveStatusFromState(state, list.find(t => t.thread_id === threadId)?.updated_at);
        cacheRef.current[threadId] = {
          state,
          timestamp: Date.now(),
          status
        };
        statusMapRef.current[threadId] = status;
      });

      // 6. Build enhanced thread list
      const enhanced: ThreadListItem[] = list.map((t) => {
        const state = allStates[t.thread_id];
        const derived = state 
          ? deriveStatusFromState(state, t.updated_at || t.metadata?.updated_at)
          : (statusMapRef.current[t.thread_id] || 'idle');
        
        statusMapRef.current[t.thread_id] = derived;

        const messages = state?.values?.messages || state?.channel_values?.messages || t.values?.messages || [];
        const lastMsg = Array.isArray(messages) && messages.length > 0 ? messages[messages.length - 1] : undefined;

        return {
          thread_id: t.thread_id,
          status: derived,
          metadata: {
            user_id: t.metadata?.user_id,
            repo: t.metadata?.repo,
            branch: t.metadata?.branch,
            created_at: t.created_at || t.metadata?.created_at,
            updated_at: t.updated_at || t.metadata?.updated_at,
            message_count: Array.isArray(messages) ? messages.length : (t.values?.messages?.length || 0),
          },
          last_message: lastMsg
            ? {
                content: lastMsg.content,
                role: lastMsg.role,
                timestamp: t.updated_at || t.metadata?.updated_at,
              }
            : undefined,
        };
      });

      console.log(`✅ Enhanced ${enhanced.length} threads`);
      setThreads(enhanced);
      
    } catch (e: any) {
      console.error('❌ Thread refresh failed:', e);
      setError(e?.message || "Failed to load threads");
    } finally {
      setLoading(false);
    }
  }, [fetchThreadStates, isCacheValid]);

  useEffect(() => {
    // initial load
    refresh();
  }, [refresh]);

  // Memoize executing status to avoid unnecessary effect re-runs
  const hasExecutingThreads = useMemo(() => 
    threads.some(t => t.status === 'executing'), 
    [threads]
  );

  // Optimized polling: less frequent and more intelligent
  useEffect(() => {
    // More intelligent adaptive intervals - less aggressive
    let interval: number;

    if (hasExecutingThreads) {
      interval = 15000; // 15s when threads are actively executing (reduced from 8s)
    } else if (threads.length > 20) {
      interval = 90000; // 1.5min for users with many threads (reduced from 1min)
    } else {
      interval = 45000; // 45s for normal usage (reduced from 30s)
    }

    const timer = setInterval(() => {
      // Only refresh if tab is visible and not loading
      if (!document.hidden && !loading) {
        // Smart refresh: only update executing threads frequently
        if (hasExecutingThreads) {
          // For executing threads, invalidate their cache to force fresh fetch
          threads.forEach(thread => {
            if (thread.status === 'executing') {
              delete cacheRef.current[thread.thread_id];
            }
          });
        }
        refresh();
      }
    }, interval);

    console.log(`⏱️ Set polling interval to ${interval/1000}s (${hasExecutingThreads ? 'executing' : threads.length > 20 ? 'many threads' : 'idle'})`);

    return () => clearInterval(timer);
  }, [refresh, hasExecutingThreads, threads.length, loading]);

  // Force refresh by clearing cache
  const forceRefresh = useCallback(async () => {
    console.log('🔄 Force refresh - clearing all caches');
    cacheRef.current = {};
    statusMapRef.current = {};
    await refresh();
  }, [refresh]);

  return {
    threads,
    loading,
    error,
    selectedThreadId,
    setSelectedThreadId,
    refresh,
    forceRefresh, // New function to clear cache and refresh
    getStatus,
  };
}


