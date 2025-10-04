export type ThreadStatus = 'idle' | 'executing' | 'completed' | 'error' | 'interrupted';

// Heuristic status derivation from LangGraph thread state shape
// Falls back gracefully if certain fields are missing
export function deriveStatusFromState(state: any, updatedAtIso?: string): ThreadStatus {
  try {
    // 1) Explicit status in metadata or top-level
    const explicit = state?.metadata?.status || state?.status;
    if (explicit && typeof explicit === 'string') {
      const s = explicit.toLowerCase();
      if (['idle','executing','completed','error','interrupted','running','success','failed','cancelled','canceled'].includes(s)) {
        if (s === 'running') return 'executing';
        if (s === 'success') return 'completed';
        if (s === 'failed' || s === 'cancelled' || s === 'canceled') return 'error';
        return s as ThreadStatus;
      }
    }

    // 1.1) Error/interrupted flags in common shapes
    if (state?.error || state?.last_error || state?.metadata?.error || state?.metadata?.last_error) {
      return 'error';
    }
    if (state?.interrupted === true) return 'interrupted';

    // 2) If there is a next queue or running nodes, we consider it executing
    if ((Array.isArray(state?.next) && state.next.length > 0) || state?.running === true) {
      // Staleness heuristic: if no update in >2min, treat as error (likely crashed/stuck)
      const updatedAt = updatedAtIso || state?.updated_at || state?.metadata?.updated_at;
      if (updatedAt) {
        const ts = new Date(updatedAt).getTime();
        if (isFinite(ts)) {
          const diffMs = Date.now() - ts;
          if (diffMs > 120000) return 'error';
        }
      }
      return 'executing';
    }

    // 3) If we have at least one message, assume the last run completed
    const messages = state?.values?.messages || state?.channel_values?.messages;
    if (Array.isArray(messages) && messages.length > 0) {
      return 'completed';
    }

    // 4) Default fallback
    return 'idle';
  } catch {
    return 'idle';
  }
}

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


