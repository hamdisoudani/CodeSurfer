"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, ArrowDown } from "lucide-react";
import { ChatMessage } from "@/components/ChatMessage";
import { TypingIndicator } from "@/components/TypingIndicator";
import { MessageSkeleton } from "@/components/MessageSkeleton";
import { EmptyChatState } from "@/components/EmptyChatState";
import { useSmartAutoScroll } from "@/hooks/useSmartAutoScroll";
import { useChatStore, type BaseMessage } from "@/store/chat";
import { useStreamAdapter } from "@/hooks/useStreamAdapter";
import { cn } from "@/lib/utils";
import { useShallow } from "zustand/react/shallow";

interface ChatAreaProps {
  selectedThreadId?: string | null;
  threadRepo?: string | null;
  threadBranch?: string | null;
  children?: React.ReactNode; // For welcome screen when no thread selected
  className?: string;
  bottomPadding?: number; // dynamic safe space to avoid overlap with composer
  // Props needed for useStreamAdapter
  session: any;
  status: string;
  baseAgentUrl: string;
  currentWorkspaceId?: string;
  // Callback to expose submit function to parent
  onSubmitReady?: (submitFn: (text: string, contextData?: any, metadata?: any) => Promise<boolean>) => void;
}

// Stable empty array to prevent infinite loops
const EMPTY_MESSAGES: BaseMessage[] = [];

function ChatAreaInner({ 
  selectedThreadId,
  threadRepo,
  threadBranch,
  children,
  className,
  bottomPadding = 0,
  session,
  status,
  baseAgentUrl,
  currentWorkspaceId,
  onSubmitReady,
}: ChatAreaProps) {
  // Initialize stream adapter - this will reinitialize when selectedThreadId changes
  const { submitMessage, isLoading: isStreamingFromHook, isInitializing } = useStreamAdapter({
    threadId: selectedThreadId || null,
    session,
    status,
    baseAgentUrl,
    currentWorkspaceId,
  });

  // Expose submitMessage to parent via callback
  React.useEffect(() => {
    if (onSubmitReady) {
      onSubmitReady(submitMessage);
    }
  }, [submitMessage, onSubmitReady]);

  // NEW: Subscribe to specific thread's cache entry (optimized)
  const messages = useChatStore((state) => {
    if (!selectedThreadId) return EMPTY_MESSAGES;
    const cache = state.threadCache[selectedThreadId];
    
    // IMPORTANT: Don't show messages while thread is still in loading state
    // This ensures the minimum loading duration (200ms) is respected
    if (cache?.loadState === 'loading') {
      return EMPTY_MESSAGES;
    }
    
    return cache?.messages || EMPTY_MESSAGES;
  });
  
  const threadLoadState = useChatStore((state) => {
    if (!selectedThreadId) return 'idle' as const;
    return state.threadCache[selectedThreadId]?.loadState || 'idle';
  });
  
  const isStreaming = useChatStore((state) => state.isStreaming);
  
  // NEW: Thread-scoped tool result getter
  const getToolResult = React.useCallback(
    (toolCallId: string) => {
      if (!selectedThreadId) return undefined;
      return useChatStore.getState().getToolResult(selectedThreadId, toolCallId);
    },
    [selectedThreadId]
  );

  // NEW: Show loading skeleton based on cache load state
  const isLoadingThread = isInitializing || (selectedThreadId && threadLoadState === 'loading');

  // DEBUG: Log when thread or messages change
  React.useEffect(() => {
    console.log('🔄 [ChatArea] Thread changed:', {
      selectedThreadId,
      messageCount: messages.length,
      loadState: threadLoadState,
      isLoading: isLoadingThread,
      firstMessage: messages[0]?.content?.substring(0, 50)
    });
  }, [selectedThreadId, messages, threadLoadState, isLoadingThread]);

  // Process messages with tool results - messages update in real-time from LangGraph
  const displayMessages = React.useMemo(() => {
    return messages.map((msg) => {
      if (!msg.tool_calls?.length) return msg;

      // Attach tool results to tool calls
      const toolCallsWithResults = msg.tool_calls.map((tc) => {
        const result = getToolResult(tc.id);
        return {
          id: tc.id,
          name: tc.name,
          args: tc.args,
          result: result?.content,
          status: result?.status || (isStreaming ? 'executing' : 'error'),
        };
      });

      return { ...msg, toolCallsWithResults };
    });
  }, [messages, getToolResult, isStreaming]);

  const { 
    scrollAreaRef, 
    isAtBottom, 
    hasNewMessages, 
    scrollToBottom, 
    markMessagesAsRead 
  } = useSmartAutoScroll({ messages: displayMessages });

  // Handle new message indicator click
  const handleScrollToBottom = () => {
    scrollToBottom();
    markMessagesAsRead();
  };

  // Compute default padding-bottom in px (pb-8=32, pb-24=96)
  const defaultPaddingPx = !selectedThreadId
    ? 32
    : (selectedThreadId && displayMessages.length > 0)
      ? 96
      : 32;
  const effectivePaddingBottom = Math.max(defaultPaddingPx, Math.round(bottomPadding));

  return (
    <div className={cn("flex-1 relative overflow-hidden", className)}>
      {/* Custom scroll area - only this part scrolls */}
      <div 
        ref={scrollAreaRef}
        className="h-full overflow-y-auto overflow-x-hidden custom-scrollbar"
        style={{
          scrollBehavior: 'smooth',
        }}
      >
        <div
          className={cn(
            // Narrower, readable chat width across breakpoints
            "max-w-2xl md:max-w-3xl lg:max-w-4xl xl:max-w-4xl mx-auto px-4 md:px-6 py-6"
          )}
          style={{ paddingBottom: effectivePaddingBottom }}
        >
          {/* 1. Welcome Screen - No thread selected */}
          {!selectedThreadId && children ? (
            children
          ) 
          /* 2. Loading State - Initializing stream or loading thread */
          : isLoadingThread ? (
            <div className="space-y-6">
              <MessageSkeleton />
              <MessageSkeleton />
              <MessageSkeleton />
            </div>
          )
          /* 3. Messages - Thread with content */
          : selectedThreadId && displayMessages.length > 0 ? (
            <>
              {displayMessages.map((msg: any, idx) => {
                // Message grouping logic to reduce redundant avatars
                const prevMsg = idx > 0 ? displayMessages[idx - 1] : null;
                const nextMsg = idx < displayMessages.length - 1 ? displayMessages[idx + 1] : null;
                
                // Group strictly by consecutive same-sender messages
                const isSameSenderAsPrev = !!(prevMsg && prevMsg.role === msg.role && prevMsg.type === msg.type);
                const isSameSenderAsNext = !!(nextMsg && nextMsg.role === msg.role && nextMsg.type === msg.type);
                
                const isFirstInGroup = !isSameSenderAsPrev;
                const isLastInGroup = !isSameSenderAsNext;
                const showAvatar = isFirstInGroup; // Only show avatar for first message in group
                
                return (
                  <ChatMessage 
                    key={idx} 
                    message={msg} 
                    showAvatar={showAvatar}
                    isFirstInGroup={isFirstInGroup}
                    isLastInGroup={isLastInGroup}
                  />
                );
              })}
              
              {/* Typing indicator - only when streaming with executing tools */}
              {isStreaming && displayMessages.some((m: any) => m.toolCallsWithResults?.some((tc: any) => tc.status === 'executing')) && (
                <TypingIndicator
                  isVisible={true}
                  toolsExecuting={displayMessages
                    .flatMap((m: any) => m.toolCallsWithResults || [])
                    .filter((tc: any) => tc.status === 'executing')
                    .map((tc: any) => ({ id: tc.id, name: tc.name, status: tc.status }))}
                />
              )}
            </>
          ) 
          /* 4. Empty Chat State - Thread selected but no messages */
          : selectedThreadId ? (
            <EmptyChatState
              threadRepo={threadRepo || undefined}
              threadBranch={threadBranch || undefined}
            />
          ) 
          /* 5. Fallback - should rarely be reached */
          : (
            children || (
              <div className="flex items-center justify-center py-16">
                <p className="text-muted-foreground">Ready for your conversation...</p>
              </div>
            )
          )}
        </div>
      </div>

      {/* New messages indicator - floating button */}
      {hasNewMessages && !isAtBottom && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10">
          <Button
            onClick={handleScrollToBottom}
            variant="secondary"
            size="sm"
            className="bg-background/95 backdrop-blur-sm border shadow-lg hover:shadow-xl transition-all duration-200 animate-in slide-in-from-bottom-2"
          >
            <ArrowDown className="w-4 h-4 mr-2" />
            New messages
            <ChevronDown className="w-4 h-4 ml-2 animate-bounce" />
          </Button>
        </div>
      )}

      {/* Scroll to bottom button - always available when not at bottom */}
      {!isAtBottom && !hasNewMessages && displayMessages.length > 3 && (
        <div className="absolute bottom-4 right-4 z-10">
          <Button
            onClick={scrollToBottom}
            variant="outline"
            size="icon"
            className="bg-background/95 backdrop-blur-sm shadow-md hover:shadow-lg transition-all duration-200 w-10 h-10 rounded-full"
            title="Scroll to bottom"
          >
            <ChevronDown className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

// Memoized wrapper to avoid re-rendering on unrelated state changes
// Note: We WANT to re-render when selectedThreadId changes to reinitialize useStream
export const ChatArea = React.memo(ChatAreaInner, (prev, next) => {
  // Only re-render if these specific props change
  return (
    prev.selectedThreadId === next.selectedThreadId &&
    prev.threadRepo === next.threadRepo &&
    prev.threadBranch === next.threadBranch &&
    prev.bottomPadding === next.bottomPadding &&
    prev.session === next.session &&
    prev.status === next.status &&
    prev.baseAgentUrl === next.baseAgentUrl &&
    prev.currentWorkspaceId === next.currentWorkspaceId &&
    prev.onSubmitReady === next.onSubmitReady
  );
});
