"use client";

import React, { useEffect, useState, Suspense, useMemo } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useSupabaseSession } from "@/lib/useSupabaseSession";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { useInstallationRepos, useRepoBranches } from "@/hooks/useInstallations";
import {
  Github,
  Settings,
  MessageSquare,
  Plus,
  Zap,
  LogOut,
  Sparkles,
  PanelLeft,
  PanelLeftClose,
  User,
  Briefcase,
  MoreHorizontal,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ThreadItem, generateConversationTitle } from "@/components/ThreadItem";
import { cn } from "@/lib/utils";

// Store and hooks
import { useChatStore, selectThreads, selectThreadsLoading, selectIsStreaming } from "@/store/chat";

// Components
import { WelcomeScreen, type ConversationMode } from "@/components/WelcomeScreen";
import { useWorkspaceManagement } from "@/hooks/useWorkspaceManagement";
import { useStreamAdapter } from "@/hooks/useStreamAdapter";

export default function Home() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const { session, status } = useSupabaseSession();

  // Store state
  const threads = useChatStore(selectThreads);
  const threadsLoading = useChatStore(selectThreadsLoading);
  const { refreshThreads } = useChatStore();

  // API URLs
  const baseAgentUrl = process.env.NEXT_PUBLIC_LANGGRAPH_API_URL || "http://localhost:2024";

  // Repository and installation state
  const [installations, setInstallations] = useState<any[]>([]);
  const [selectedInstallationId, setSelectedInstallationId] = useState<string | null>(null);
  const { repos, loading: reposLoading } = useInstallationRepos(selectedInstallationId);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const { branches, loading: branchesLoading } = useRepoBranches(selectedInstallationId, selectedRepo);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  
  // UI state
  const [input, setInput] = useState("");
  const [pentestingMode, setPentestingMode] = useState(false);
  const [conversationMode, setConversationMode] = useState<ConversationMode>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("conversation-mode");
      return (saved as ConversationMode) || "repo";
    }
    return "repo";
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("sidebar-collapsed");
      return saved ? JSON.parse(saved) : false;
    }
    return false;
  });
  
  // Save sidebar state to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("sidebar-collapsed", JSON.stringify(sidebarCollapsed));
    }
  }, [sidebarCollapsed]);

  // Save conversation mode to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("conversation-mode", conversationMode);
    }
  }, [conversationMode]);
  
  const sidebarWidth = useMemo(() => sidebarCollapsed ? 64 : 280, [sidebarCollapsed]);

  // Workspace management (for new conversations only)
  const {
    workspaceMap,
    currentWorkspaceId,
    currentWorkspace,
    isCurrentWorkspaceReady,
    needsIndexing,
    startIndexing,
  } = useWorkspaceManagement({
    selectedRepo,
    selectedBranch,
    threadRepo: null,
    threadBranch: null,
    selectedThreadId: null,
    effectiveInstallationId: selectedInstallationId,
    status,
  });

  // Stream adapter for creating new threads (threadId = null)
  const { submitMessage, isLoading: isStreamLoading } = useStreamAdapter({
    threadId: null, // null = create new thread on submit
    session,
    status,
    baseAgentUrl,
    currentWorkspaceId,
    onNewThreadCreated: (newThreadId: string) => {
      // Navigate to the new thread immediately when it's created
      console.log('🚀 [page.tsx] Navigating to new thread:', newThreadId);
      router.push(`/c/${newThreadId}`);
    },
  });

  // Get streaming status from store - use memoized selector
  const isStreaming = useChatStore(selectIsStreaming);

  // Load installations on authentication
  useEffect(() => {
    if (status === "authenticated") {
    (async () => {
      try {
        const res = await fetch("/api/installations/check");
          const data = await res.json();
          const installations = data.data?.installations || [];
          setInstallations(
            installations.map((inst: any) => ({
            id: parseInt(inst.installation_id),
            account: { login: inst.account_login, type: inst.account_type },
              repository_selection: inst.repository_selection,
            }))
          );
          if (installations.length === 1 && !selectedInstallationId) {
            setSelectedInstallationId(installations[0].installation_id);
          }
        } catch (error) {
          console.error("Failed to load installations:", error);
        }
      })();
    }
  }, [status, selectedInstallationId]);

  // Load threads on authentication
  useEffect(() => {
    if (status === "authenticated") {
      refreshThreads();

      // Poll for thread updates every 15 seconds
      const interval = setInterval(() => {
        refreshThreads();
      }, 15000);

      return () => clearInterval(interval);
    }
  }, [status]); // Remove refreshThreads from deps to avoid infinite loop

  // Submit message handler (only for new conversations)
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

    // USER ID for metadata
    const userIdMeta =
      session?.user?.id ||
      session?.user?.user_metadata?.login ||
      session?.user?.user_metadata?.name ||
      session?.user?.email ||
      "user-unknown";

    // 🔥 SCRATCH MODE: Skip all workspace/repo validation
    if (conversationMode === 'scratch') {
      const contextData = {
        githubUsername:
          session.user?.user_metadata?.login ||
          session.user?.user_metadata?.name ||
          session.user?.email,
        installationId: selectedInstallationId || undefined,
        accessToken: session.access_token,
        mode: 'scratch', // ⚡ Key indicator for agent
      };

      const threadMetadata = {
        user_id: userIdMeta,
        mode: 'scratch',
      };

      // Clear input immediately
      setInput("");
      
      const toastId = toast.loading("Creating scratch project...", {
        description: "Starting AI-powered development",
      });
      
      console.log("🚀 Creating scratch mode conversation:", { text, contextData, threadMetadata });
      
      const success = await submitMessage(text, contextData, threadMetadata);
      
      if (success) {
        toast.dismiss(toastId);
      } else {
        setInput(text);
        toast.dismiss(toastId);
        toast.error("Failed to create conversation", {
          description: "Please try again",
        });
      }
      return;
    }

    // 🔥 REPO MODE: Validate workspace requirements (existing logic)
    if (!selectedRepo || !selectedBranch) {
      toast.error("Repository and branch selection required", {
        description: "Please select a repository and branch before starting a conversation.",
      });
      return;
    }

    if (!currentWorkspace) {
      toast.error("Workspace not found", {
        description: "Please create a workspace for this repository and branch first.",
      });
      return;
    }

    if (currentWorkspace.index_status !== "ready") {
      toast.error("Repository not indexed", {
        description: "Please wait for indexing to complete before starting a conversation.",
      });
      return;
    }

    // Build context data for the agent (repo mode)
    const contextData = {
      githubUsername:
        session.user?.user_metadata?.login ||
        session.user?.user_metadata?.name ||
        session.user?.email,
      installationId: selectedInstallationId,
      targetRepo: selectedRepo,
      selectedBranch: selectedBranch,
      accessToken: session.access_token,
      pentestingMode,
      mode: 'repo', // ⚡ Explicit repo mode indicator
    };

    // Create thread metadata (repo mode)
    const threadMetadata = {
      user_id: userIdMeta,
      installation_id: selectedInstallationId || undefined,
      repo: selectedRepo || undefined,
      branch: selectedBranch || undefined,
      workspace_id: currentWorkspace?.id,
      index_status: currentWorkspace?.index_status,
      is_indexed: currentWorkspace?.index_status === "ready",
      mode: 'repo',
    };

    // Clear input immediately for snappy UX
    setInput("");
    
    // Show loading toast
    const toastId = toast.loading("Creating conversation...", {
      description: "Starting security analysis",
    });
    
    console.log("🚀 Creating new thread with:", { text, contextData, threadMetadata });
    
    // Submit message - this will create a new thread and start streaming
    // Navigation will happen automatically via onNewThreadCreated callback
    const success = await submitMessage(text, contextData, threadMetadata);
    
    if (success) {
      toast.dismiss(toastId);
      // Navigation happens in onNewThreadCreated callback from useStreamAdapter
    } else {
      // Restore input on failure
      setInput(text);
      toast.dismiss(toastId);
      toast.error("Failed to create conversation", {
        description: "Please try again",
      });
    }
  };

  // Loading screen
  if (status === "loading") {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="w-10 h-10 border-4 border-muted border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  // Login screen
  if (status !== "authenticated") {
    return (
      <div className="h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-50 to-slate-100">
        <Card className="w-full max-w-md shadow-xl border-0">
          <CardHeader className="text-center space-y-4 p-8">
            <div className="w-14 h-14 mx-auto bg-primary text-primary-foreground rounded-xl flex items-center justify-center">
              <Zap className="w-6 h-6" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold text-foreground">CodeSurf</CardTitle>
              <CardDescription className="text-base mt-2">AI-Powered Security Analysis</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-8 pt-0">
            <Button 
              onClick={() => supabase.auth.signInWithOAuth({ provider: "github" })} 
              className="w-full h-11 bg-primary text-primary-foreground font-semibold" 
              size="lg"
            >
              <Github className="w-4 h-4 mr-2" />
              Continue with GitHub
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-screen flex font-sans bg-background text-foreground">
      {/* Sidebar */}
      <div
        className={`${sidebarCollapsed ? "w-[64px]" : "w-[280px]"} bg-sidebar/95 border-r border-sidebar-border/40 flex flex-col transition-all duration-300 relative`}
      >
        {/* Header */}
        <div className="relative p-3 border-b border-sidebar-border/30">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              {sidebarCollapsed ? (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSidebarCollapsed(false)}
                  className="w-8 h-8 text-muted-foreground hover:bg-muted hover:text-foreground hover:scale-105 transition-all duration-200 group"
                  title="Expand sidebar"
                >
                    <PanelLeft className="w-4 h-4" />
                </Button>
              ) : (
                <>
                  <div className="w-8 h-8 bg-gradient-to-br from-primary to-primary/80 text-primary-foreground rounded-xl flex items-center justify-center shadow-sm">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div className="leading-tight">
                    <h1 className="text-base font-semibold">CodeSurf</h1>
                    <p className="text-[11px] text-muted-foreground">AI Security</p>
                  </div>
                </>
              )}
            </div>
            {!sidebarCollapsed && (
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => window.open("/dashboard", "_blank")}
                  className="w-8 h-8 text-muted-foreground hover:bg-muted hover:text-foreground hover:scale-105 transition-all duration-200 group"
                  title="Open Dashboard"
                >
                  <Settings className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSidebarCollapsed(true)}
                  className="w-8 h-8 text-muted-foreground hover:bg-muted hover:text-foreground hover:scale-105 transition-all duration-200 group"
                  title="Collapse sidebar"
                >
                    <PanelLeftClose className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
                
          <Separator className="bg-sidebar-border/40" />
        
        {/* Conversations */}
        <div className="relative flex-1 flex flex-col min-h-0 overflow-hidden">
          {sidebarCollapsed ? (
            <div className="flex flex-col items-center gap-3 shrink-0 px-2 py-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => window.location.href = "/"}
                className="w-8 h-8 hover:bg-primary/10 hover:text-primary transition-colors rounded-lg"
                title="New conversation"
              >
                <Plus className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => window.open("/dashboard/jobs", "_blank")}
                className="w-8 h-8 hover:bg-primary/10 hover:text-primary transition-colors rounded-lg"
                title="View indexing jobs"
              >
                <Briefcase className="w-4 h-4" />
              </Button>
              <div className="w-6 h-px bg-border/30"></div>
            </div>
          ) : (
          <div className="px-3 py-2 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">Conversations</h2>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                  onClick={() => window.open("/dashboard/jobs", "_blank")}
                className="w-8 h-8 hover:bg-primary/10 hover:text-primary transition-colors"
                title="View indexing jobs"
              >
                <Briefcase className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => window.location.href = "/"}
                className="w-8 h-8 hover:bg-primary/10 hover:text-primary transition-colors"
                title="New conversation"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
          )}
          
          <div className="flex-1 min-h-0 overflow-hidden">
            <ScrollArea className={cn("h-full overflow-x-hidden", sidebarCollapsed ? "px-2" : "px-2")}>
              <div className={cn("py-2", sidebarCollapsed ? "space-y-2" : "space-y-1")}>
                <Suspense
                  fallback={
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="h-12 bg-muted/30 rounded-md animate-pulse" />
                    ))}
                  </div>
                  }
                >
                  {threads.length > 0 ? (
                    <>
                      {threads.map((thread, index) =>
                        sidebarCollapsed ? (
                          index < 5 ? (
                            <div
                              key={thread.thread_id}
                              className={cn(
                                "relative w-full flex justify-center cursor-pointer transition-all duration-300 rounded-lg group py-2",
                                "hover:bg-accent/60"
                              )}
                              onClick={() => {
                                setSidebarCollapsed(false);
                                window.location.href = `/c/${thread.thread_id}`;
                              }}
                              title={`Click to expand and view: ${generateConversationTitle(thread)} - ${thread.metadata?.repo || "Security Analysis"}`}
                            >
                              <div
                                className={cn(
                                "w-2.5 h-2.5 rounded-full transition-all duration-300",
                                  thread.status === "executing" && "bg-blue-500 animate-pulse",
                                  thread.status === "completed" && "bg-green-500",
                                  thread.status === "error" && "bg-red-500",
                                  thread.status === "idle" && "bg-gray-400",
                                "group-hover:scale-125"
                                )}
                              />
                            </div>
                          ) : null
                        ) : (
                          <div key={thread.thread_id} className="w-full overflow-hidden">
                          <ThreadItem
                            thread={thread}
                            isSelected={false}
                            sidebarWidth={sidebarWidth}
                          />
                          </div>
                        )
                      )}
                      {sidebarCollapsed && threads.length > 5 && (
                        <div
                          className="flex justify-center py-3 cursor-pointer group"
                          onClick={() => setSidebarCollapsed(false)}
                          title={`Expand to see ${threads.length - 5} more conversations`}
                        >
                          <div className="flex items-center gap-1 transition-all group-hover:scale-110">
                            <div className="w-1 h-1 bg-muted-foreground/40 rounded-full group-hover:bg-muted-foreground/60 transition-colors"></div>
                            <div className="w-1 h-1 bg-muted-foreground/40 rounded-full group-hover:bg-muted-foreground/60 transition-colors"></div>
                            <div className="w-1 h-1 bg-muted-foreground/40 rounded-full group-hover:bg-muted-foreground/60 transition-colors"></div>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    !sidebarCollapsed && (
                      <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center mb-4">
                          <MessageSquare className="w-5 h-5 text-primary/60" />
                    </div>
                        <h3 className="text-sm font-medium text-foreground/80 mb-1">No conversations yet</h3>
                        <p className="text-xs text-muted-foreground/70 leading-relaxed">
                          Start analyzing a repository for security vulnerabilities
                        </p>
                      </div>
                    )
                  )}
                </Suspense>
              </div>
            </ScrollArea>
          </div>

          {/* Profile section at bottom */}
          <div className="mt-auto border-t border-sidebar-border/30 p-2">
            {sidebarCollapsed ? (
              <div className="flex justify-center">
                <Popover>
                  <PopoverTrigger asChild>
                    <button title="Account settings">
                      <Avatar className="w-8 h-8">
                <AvatarImage src={undefined} />
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
                          {session?.user?.email?.charAt(0)?.toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="right" className="w-56 mb-2">
                    <div className="space-y-1">
                      <div className="px-2 py-1.5">
                        <p className="text-sm font-medium leading-tight truncate">
                          {session?.user?.email?.split("@")[0] || "Account"}
                        </p>
                        <p className="text-xs text-muted-foreground leading-tight">
                          {installations.length} installation{installations.length !== 1 ? "s" : ""}
                  </p>
                </div>
                      <Separator />
                      <button
                        className="w-full flex items-center gap-2 text-left text-sm px-2 py-1.5 rounded-md hover:bg-muted"
                        onClick={() => window.open("/dashboard/installations", "_blank")}
                      >
                        <Settings className="w-4 h-4" />
                        <span>Manage installations</span>
                      </button>
                      <button
                        className="w-full flex items-center gap-2 text-left text-sm px-2 py-1.5 rounded-md hover:bg-muted"
                onClick={() => supabase.auth.signOut()}
              >
                        <LogOut className="w-4 h-4" />
                        <span>Log out</span>
                      </button>
            </div>
                  </PopoverContent>
                </Popover>
          </div>
            ) : (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 transition-colors"
                    title="Account settings"
                  >
                    <Avatar className="w-7 h-7">
                      <AvatarImage src={undefined} />
                      <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
                        {session?.user?.email?.charAt(0)?.toUpperCase() || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 text-left">
                      <p className="text-xs font-medium leading-tight truncate">
                        {session?.user?.email?.split("@")[0] || "Account"}
                      </p>
                  </div>
                    <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                  </button>
                </PopoverTrigger>
                <PopoverContent side="top" className="w-56 mb-2">
                  <div className="space-y-1">
                    <div className="px-2 py-1.5">
                      <p className="text-sm font-medium leading-tight truncate">
                        {session?.user?.email?.split("@")[0] || "Account"}
                      </p>
                      <p className="text-xs text-muted-foreground leading-tight">
                        {installations.length} installation{installations.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <Separator />
                    <button
                      className="w-full flex items-center gap-2 text-left text-sm px-2 py-1.5 rounded-md hover:bg-muted"
                      onClick={() => window.open("/dashboard/installations", "_blank")}
                    >
                      <Settings className="w-4 h-4" />
                      <span>Manage installations</span>
                    </button>
                    <button
                      className="w-full flex items-center gap-2 text-left text-sm px-2 py-1.5 rounded-md hover:bg-muted"
                      onClick={() => supabase.auth.signOut()}
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Log out</span>
                    </button>
                                    </div>
                </PopoverContent>
              </Popover>
            )}
                          </div>
                        </div>
        </div>

      {/* Main Area - New Conversation Welcome Screen */}
      <div className="flex-1 flex flex-col h-screen bg-background overflow-hidden">
        <WelcomeScreen
          mode={conversationMode}
          onModeChange={setConversationMode}
          repos={repos}
          branches={branches}
          selectedRepo={selectedRepo}
          selectedBranch={selectedBranch}
          onRepoChange={(repo) => {
            setSelectedRepo(repo);
            setSelectedBranch(null);
          }}
          onBranchChange={setSelectedBranch}
          workspaceMap={workspaceMap}
          onStartIndexing={() => startIndexing()}
          input={input}
          onInputChange={setInput}
          onSubmit={handleSubmit}
          isLoadingRepos={reposLoading}
          isLoadingBranches={branchesLoading}
          isLoading={isStreaming || isStreamLoading}
        />
      </div>
    </div>
  );
}
