"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useSupabaseSession } from "@/lib/useSupabaseSession";
import { toast } from "sonner";

// Store and hooks
import { useChatStore } from "@/store/chat";

// Components
import { ChatArea } from "@/components/ChatArea";
import { MessageComposer } from "@/components/MessageComposer";
import { useWorkspaceManagement } from "@/hooks/useWorkspaceManagement";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";

export default function ThreadPage() {
  const params = useParams();
  const router = useRouter();
  const threadId = params.id as string;
  
  const supabase = getSupabaseBrowserClient();
  const { session, status } = useSupabaseSession();
  
  // Local state
  const [input, setInput] = useState("");
  const [threadLoading, setThreadLoading] = useState(true);
  const [threadNotFound, setThreadNotFound] = useState(false);
  
  // Store state
  const { threads, refreshThreads } = useChatStore();
  const isStreaming = useChatStore((state) => state.isStreaming);
  
  // Find current thread
  const currentThread = threads.find((t) => t.thread_id === threadId);
  const threadRepo = currentThread?.metadata?.repo || null;
  const threadBranch = currentThread?.metadata?.branch || null;
  const threadMode = (currentThread?.metadata as any)?.mode || 'repo'; // 'scratch' or 'repo'
  
  // Workspace management
  const {
    currentWorkspaceId,
  } = useWorkspaceManagement({
    selectedRepo: null,
    selectedBranch: null,
    threadRepo,
    threadBranch,
    selectedThreadId: threadId,
    effectiveInstallationId: null,
    status,
  });

  // API URLs
  const baseAgentUrl = process.env.NEXT_PUBLIC_LANGGRAPH_API_URL || "http://localhost:2024";

  // Submit message ref
  const submitMessageRef = useRef<((text: string, contextData?: any, metadata?: any) => Promise<boolean>) | null>(null);

  // Load thread on mount
  useEffect(() => {
    if (status === "authenticated") {
      setThreadLoading(true);
      
      // Refresh threads to get latest data
      refreshThreads().then(() => {
        // Check if thread exists
        const thread = useChatStore.getState().threads.find((t) => t.thread_id === threadId);
        if (!thread) {
          setThreadNotFound(true);
        }
        setThreadLoading(false);
      });
    }
  }, [status, threadId, refreshThreads]);

  // Submit message handler
  const handleSubmit = async () => {
    const text = input.trim();
    if (!text) return;

    // Validate auth
    if (status !== "authenticated" || !session?.access_token) {
      toast.error("Authentication required", {
        description: "Please sign in to continue.",
      });
      return;
    }

    // Clear input immediately
    setInput("");
    
    // Build context and metadata with mode (important for scratch mode threads!)
    const contextData = threadMode === 'scratch' ? { mode: 'scratch' } : undefined;
    const metadata = { mode: threadMode }; // Pass mode to ensure auth middleware knows this is scratch/repo mode
    
    // Call submit function from ChatArea (via ref)
    if (submitMessageRef.current) {
      const success = await submitMessageRef.current(text, contextData, metadata);
      if (!success) {
        // Restore input on failure
        setInput(text);
      }
    } else {
      console.error("❌ Submit function not ready");
      toast.error("System not ready", {
        description: "Please wait a moment and try again.",
      });
      setInput(text);
    }
  };

  // Loading screen
  if (status === "loading" || threadLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading conversation...</p>
        </div>
      </div>
    );
  }

  // Not authenticated
  if (status !== "authenticated") {
    router.push("/login");
    return null;
  }

  // Thread not found
  if (threadNotFound) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <ArrowLeft className="w-8 h-8 text-muted-foreground" />
          </div>
          <h1 className="text-2xl font-bold">Conversation not found</h1>
          <p className="text-muted-foreground">
            This conversation doesn't exist or you don't have access to it.
          </p>
          <Button onClick={() => router.push("/")}>
            Back to Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="border-b border-border px-4 py-3 flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/")}
          className="hover:bg-muted"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-sm font-semibold truncate">
            {currentThread?.metadata?.repo 
              ? `${currentThread.metadata.repo}:${currentThread.metadata.branch || 'main'}`
              : "Security Analysis"
            }
          </h1>
          <p className="text-xs text-muted-foreground">
            {threadId}
          </p>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <ChatArea
          key={threadId}
          selectedThreadId={threadId}
          threadRepo={threadRepo}
          threadBranch={threadBranch}
          className="flex-1 min-h-0"
          bottomPadding={140}
          session={session}
          status={status}
          baseAgentUrl={baseAgentUrl}
          currentWorkspaceId={currentWorkspaceId}
          onSubmitReady={(submitFn) => {
            submitMessageRef.current = submitFn;
          }}
        />

        {/* Message Composer */}
        <MessageComposer
          key={`composer-${threadId}`}
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          disabled={false}
          isLoading={isStreaming}
          contextTokens={0}
          connectionStatus={{
            isConnected: Boolean(threadRepo),
            repo: threadRepo || undefined,
            branch: threadBranch || undefined,
          }}
          showIndexButton={false}
          onStartIndexing={() => {}}
          sidebarWidth={0}
        />
      </div>
    </div>
  );
}

