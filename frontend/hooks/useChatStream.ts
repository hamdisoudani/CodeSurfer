import { useState, useMemo, useEffect, useCallback } from 'react';
import { useStream } from "@langchain/langgraph-sdk/react";
import { toast } from 'sonner';

interface ToolCall {
  name: string;
  status: "executing" | "completed" | "error";
  args?: unknown;
  result?: unknown;
  startTime?: number;
}

interface UseChatStreamOptions {
  selectedThreadId: string | null;
  session: any;
  status: string;
  baseAgentUrl: string;
  currentWorkspaceId?: string;
  onThreadId?: (threadId: string) => void;
  onError?: (error: any) => void;
}

export function useChatStream({
  selectedThreadId,
  session,
  status,
  baseAgentUrl,
  currentWorkspaceId,
  onThreadId,
  onError
}: UseChatStreamOptions) {
  const [toolCalls, setToolCalls] = useState<Record<string, ToolCall>>({});
  const [waitingForNewThread, setWaitingForNewThread] = useState(false);
  
  // Message cache to prevent reloading when switching threads
  const [messageCache, setMessageCache] = useState<Record<string, any[]>>({});

  // Build headers for stream
  const defaultHeaders = useMemo(() => {
    const headers: Record<string, string> = {};
    const token = session?.access_token;
    
    console.log("🔧 Frontend: Building headers", {
      hasSession: !!session,
      hasToken: !!token,
      tokenLength: token?.length,
      currentWorkspaceId,
      sessionStatus: status,
      token: token
    });
    
    if (token) headers["authorization"] = `Bearer ${token}`;
    if (currentWorkspaceId) headers["x-workspace-id"] = currentWorkspaceId;
    return headers;
  }, [session?.access_token, currentWorkspaceId, status]);

  // Stable callbacks to prevent stream re-initialization
  const onThreadIdCallback = useCallback((threadId: string) => {
    // If no thread is currently selected, always forward the new thread id.
    // This avoids race conditions where waitingForNewThread hasn't updated yet.
    if (!selectedThreadId) {
      setWaitingForNewThread(false);
      onThreadId?.(threadId);
    }
  }, [selectedThreadId, onThreadId]);

  const onErrorCallback = useCallback((error: any) => {
    console.error("Stream error:", error);
    
    // Mark any executing tool calls as failed when stream errors occur
    setToolCalls(prevToolCalls => {
      const updatedToolCalls = { ...prevToolCalls };
      Object.keys(updatedToolCalls).forEach(id => {
        if (updatedToolCalls[id].status === "executing") {
          updatedToolCalls[id] = {
            ...updatedToolCalls[id],
            status: "error",
            result: `Error: ${error?.message || "Stream connection failed"}`
          };
        }
      });
      return updatedToolCalls;
    });
    
    toast.error("An error occurred with the connection.", {
      description: error?.message || "Please try again.",
    });
    
    onError?.(error);
  }, [onError]);

  // Initialize stream with stable options
  const streamOptions = useMemo(() => ({
    apiUrl: baseAgentUrl,
    assistantId: "agent",
    threadId: selectedThreadId,
    messagesKey: "messages",
    reconnectOnMount: false, // Disable aggressive reconnecting 
    defaultHeaders,
    onThreadId: onThreadIdCallback,
    onError: onErrorCallback,
  }), [baseAgentUrl, selectedThreadId, defaultHeaders, onThreadIdCallback, onErrorCallback]);

  const stream = useStream(streamOptions);

  // Debug: lightweight streaming instrumentation (opt-in)
  useEffect(() => {
    const enabled =
      (typeof window !== 'undefined' && (window as any).__STREAM_DEBUG__ === true) ||
      process.env.NEXT_PUBLIC_STREAM_DEBUG === '1';
    if (!enabled) return;
    if (!stream.isLoading) return;

    const startedAt = performance.now();
    let lastLen = stream.messages?.length || 0;
    let ticks = 0;
    const maxTicks = 30; // stop after ~30s to avoid log spam

    const interval = setInterval(() => {
      const msgs = stream.messages?.length || 0;
      const deltaMsgs = msgs - lastLen;
      lastLen = msgs;
      console.debug('[stream] tick', { tick: ticks, deltaMsgs, totalMsgs: msgs, isLoading: stream.isLoading });

      ticks += 1;
      if (!stream.isLoading || ticks >= maxTicks) {
        clearInterval(interval);
        const durationMs = Math.round(performance.now() - startedAt);
        console.debug('[stream] instrumentation end', { durationMs, ticks, finalMsgs: msgs });
      }
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [stream.isLoading]);

  // Cache messages when they change
  useEffect(() => {
    if (selectedThreadId && stream.messages?.length > 0) {
      setMessageCache(prev => ({
        ...prev,
        [selectedThreadId]: stream.messages
      }));
    }
  }, [selectedThreadId, stream.messages]);

  // Process messages with tool results (optimized)
  const processedMessages = useMemo(() => {
    // If there's no selected thread, hide any residual messages from previous stream
    if (!selectedThreadId) {
      return [];
    }

    // Prefer cached messages when they are more recent than the stream
    const cache = selectedThreadId ? messageCache[selectedThreadId] : undefined;
    const messagesToProcess = selectedThreadId && cache?.length
      ? (cache.length >= (stream.messages?.length || 0) ? cache : stream.messages)
      : stream.messages;

    if (!messagesToProcess?.length) {
      // Return cached processed messages if available
      return (selectedThreadId && (messageCache as any)[`processed_${selectedThreadId}`]) || [];
    }

    // Memoize tool results map to avoid recreating on every render
    const toolResults = new Map<string, any>();
    messagesToProcess.forEach((msg: any) => {
      if (msg.type === "tool" && msg.tool_call_id) {
        toolResults.set(msg.tool_call_id, msg);
      }
    });

    const processed: any[] = [];
    messagesToProcess.forEach((msg: any) => {
      if (msg.type === "tool") return;

      const toolCallsWithResults = (msg.tool_calls || []).map((tc: any) => {
        const id = tc.id ?? tc.tool_call_id;
        const toolResult = toolResults.get(id);
        const streamingInfo = toolCalls[id];
        let args: unknown = tc.args;

        if (!args && tc.function?.arguments) {
          try {
            args = JSON.parse(tc.function.arguments);
          } catch {
            args = tc.function.arguments;
          }
        }

        // Better tool call status resolution with error handling
        let status = "executing";
        let result = undefined;

        if (toolResult) {
          status = "completed";
          result = toolResult.content;
        } else if (streamingInfo) {
          status = streamingInfo.status;
          result = streamingInfo.result;
        } else {
          // Tool call exists in message but no result and no streaming info
          if (stream.isLoading) {
            // Stream is active, track it optimistically
            setToolCalls(prev => ({
              ...prev,
              [id]: {
                name: tc.name ?? "tool",
                status: "executing",
                args,
                startTime: Date.now()
              }
            }));
            status = "executing";
          } else {
            // Stream is not active and no result exists - likely interrupted
            status = "error";
            result = "Tool execution was interrupted (page was reloaded or session ended)";
          }
        }

        return { id, name: tc.name ?? "tool", args, result, status };
      });

      processed.push({ ...msg, toolCallsWithResults });
    });

    return processed;
  }, [stream.messages, toolCalls, selectedThreadId, stream.isLoading, selectedThreadId ? messageCache[selectedThreadId] : null]);

  // Cache processed messages in an effect (avoid setState inside render)
  useEffect(() => {
    if (!selectedThreadId) return;
    if (processedMessages.length === 0) return;

    setMessageCache(prev => {
      const key = `processed_${selectedThreadId}`;
      const prevProcessed = (prev as any)[key];
      if (prevProcessed && Array.isArray(prevProcessed) && prevProcessed.length === processedMessages.length) {
        return prev; // no change
      }
      return { ...prev, [key]: processedMessages };
    });
  }, [selectedThreadId, processedMessages]);

  // Extract currently executing tools for typing indicator
  const executingTools = useMemo(() => {
    const executing: Array<{ id: string; name: string; status: string }> = [];
    
    // From processed messages
    processedMessages.forEach((msg: any) => {
      if (msg.toolCallsWithResults) {
        msg.toolCallsWithResults.forEach((tc: any) => {
          if (tc.status === "executing") {
            executing.push({
              id: tc.id,
              name: tc.name,
              status: tc.status
            });
          }
        });
      }
    });
    
    return executing;
  }, [processedMessages]);

  // Estimate context tokens
  const contextTokenEstimate = useMemo(() => {
    try {
      const list: any[] = stream.messages || [];
      let chars = 0;
      
      for (const msg of list) {
        const c = msg?.content;
        if (typeof c === 'string') {
          chars += c.length;
        } else if (Array.isArray(c)) {
          for (const part of c) {
            if (typeof part === 'string') chars += part.length;
            else if (part?.text) chars += String(part.text).length;
            else if (typeof part?.content === 'string') chars += part.content.length;
          }
        } else if (c && typeof c === 'object') {
          if (typeof c.text === 'string') chars += c.text.length;
          else if (typeof c.content === 'string') chars += c.content.length;
        }
      }
      
      return Math.ceil(chars / 4);
    } catch {
      return 0;
    }
  }, [stream.messages]);

  // Submit message function (optimized)
  const submitMessage = useCallback(async (
    text: string,
    contextData?: any,
    metadata?: any
  ) => {
    if (!text.trim()) return false;

    try {
      // Optimistically append the user's message to the cache for instant UI feedback
      if (selectedThreadId) {
        setMessageCache(prev => {
          const base = prev[selectedThreadId] || stream.messages || [];
          return {
            ...prev,
            [selectedThreadId]: [
              ...base,
              { role: "user", content: text }
            ],
          } as Record<string, any[]>;
        });
      }

      if (!selectedThreadId) {
        setWaitingForNewThread(true);
        await stream.submit(
          { messages: [{ role: "user", content: text }], context: contextData },
          { metadata, config: { recursion_limit: 1000 } },
        );
      } else {
        await stream.submit(
          { messages: [{ role: "user", content: text }], context: contextData },
          { threadId: selectedThreadId, metadata, config: { recursion_limit: 1000 } }
        );
      }
      return true;
    } catch (error) {
      console.error("Error submitting message:", error);
      setWaitingForNewThread(false);

      // Parse LangGraph auth errors and show user-friendly messages
      const errorMessage = (error as any)?.message || "Failed to send message.";
      if (errorMessage.includes("Repository must be indexed")) {
        toast.error("Repository not ready", {
          description: "Please wait for repository indexing to complete."
        });
      } else if (errorMessage.includes("Workspace context required")) {
        toast.error("Workspace required", {
          description: "Please select a repository and branch to continue."
        });
      } else {
        toast.error("Failed to send message", {
          description: errorMessage
        });
      }
      return false;
    }
  }, [selectedThreadId, stream]);

  // Timeout mechanism for long-running tools (5 minutes)
  useEffect(() => {
    const TOOL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
    const interval = setInterval(() => {
      const now = Date.now();
      setToolCalls(prevToolCalls => {
        const updatedToolCalls = { ...prevToolCalls };
        let hasUpdates = false;
        
        Object.keys(updatedToolCalls).forEach(id => {
          const toolCall = updatedToolCalls[id];
          if (toolCall.status === "executing" && 
              toolCall.startTime && 
              (now - toolCall.startTime) > TOOL_TIMEOUT_MS) {
            updatedToolCalls[id] = {
              ...toolCall,
              status: "error",
              result: "Error: Tool execution timed out after 5 minutes"
            };
            hasUpdates = true;
          }
        });
        
        return hasUpdates ? updatedToolCalls : prevToolCalls;
      });
    }, 30000); // Check every 30 seconds
    
    return () => clearInterval(interval);
  }, []);

  return {
    stream,
    processedMessages,
    executingTools,
    contextTokenEstimate,
    submitMessage,
    waitingForNewThread,
    setWaitingForNewThread,
    toolCalls,
    setToolCalls
  };
}
