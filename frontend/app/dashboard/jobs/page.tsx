"use client";

import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";

// Add custom animations and styles
const progressStyles = `
  @keyframes progress-shine {
    0% { transform: translateX(-100%); opacity: 0; }
    50% { opacity: 1; }
    100% { transform: translateX(100%); opacity: 0; }
  }

  @keyframes progress-glow {
    0%, 100% { box-shadow: 0 0 5px currentColor; }
    50% { box-shadow: 0 0 20px currentColor; }
  }

  .progress-building {
    position: relative;
    overflow: hidden;
  }

  .progress-building::after {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent);
    animation: progress-shine 2s infinite;
  }

  .progress-ready {
    animation: progress-glow 2s ease-in-out infinite alternate;
  }
`;

if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = progressStyles;
  document.head.appendChild(style);
}

type Workspace = {
  id: string;
  repo: string;
  branch: string;
  index_status: "pending" | "building" | "ready" | "failed" | "stale";
  last_indexed_at?: string | null;
  last_commit_sha?: string | null;
  embed_provider?: string | null;
  embed_model?: string | null;
  snapshot_id?: string | null;
  volume_id?: string | null;
  latest_job?: {
    id: string;
    type: string;
    status: string;
    progress: number;
    started_at?: string | null;
    finished_at?: string | null;
    error?: string | null;
  } | null;
  progress: number;
  job_status?: string | null;
  job_error?: string | null;
  job_started_at?: string | null;
  job_finished_at?: string | null;
};

type ProgressEvent = {
  workspace_id: string;
  status?: string;
  index_status?: string;
  progress?: number | null;
  phase?: string | null;
  error?: string | null;
};

export default function JobsPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(false);
  const [progressMap, setProgressMap] = useState<Record<string, { progress: number | null; phase: string | null; status: string | undefined }>>({});
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const eventSourcesRef = useRef<Record<string, EventSource>>({});

  const refresh = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/workspaces", { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to fetch workspaces (${res.status})`);
      const data = await res.json();
      const items: Workspace[] = data.workspaces || data.data?.workspaces || [];
      setWorkspaces(items);
      setLastRefresh(new Date());
    } catch (e: any) {
      toast.error("Failed to load workspaces", { description: e?.message || "Unknown error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  // Filter workspaces that need active monitoring (only building/pending/stale, not ready/error)
  const activeWorkspaces = useMemo(() =>
    workspaces.filter(ws => {
      const status = ws.index_status;
      return status === 'building' || status === 'pending' || status === 'stale';
    }), [workspaces]
  );

  // Open/maintain SSE streams only for active workspaces
  useEffect(() => {
    const existing = eventSourcesRef.current;
    const activeIds = new Set(activeWorkspaces.map(w => w.id));

    // Start streams for active workspaces only
    for (const ws of activeWorkspaces) {
      if (!existing[ws.id]) {
        const es = new EventSource(`/api/workspaces/${ws.id}/events`);
        es.onmessage = (e) => {
          try {
            const payload = JSON.parse(e.data) as ProgressEvent;
            const status = (payload.index_status || payload.status) as string | undefined;
            setProgressMap(prev => ({
              ...prev,
              [ws.id]: {
                progress: payload.progress ?? null,
                phase: payload.phase ?? null,
                status,
              }
            }));
            // Auto-close when job completes or fails
            if (status === 'ready' || status === 'failed') {
              es.close();
              delete existing[ws.id];
            }
          } catch {}
        };
        es.onerror = () => { es.close(); delete existing[ws.id]; };
        existing[ws.id] = es;
      }
    }

    // Close streams for inactive workspaces
    for (const id of Object.keys(existing)) {
      if (!activeIds.has(id)) {
        existing[id].close();
        delete existing[id];
      }
    }

    return () => {
      for (const id of Object.keys(existing)) {
        existing[id].close();
      }
      eventSourcesRef.current = {};
    };
  }, [activeWorkspaces]);

  // Periodic refresh for new jobs (when there are active indexing jobs)
  const hasActiveJobs = activeWorkspaces.length > 0;
  useEffect(() => {
    if (!hasActiveJobs) return;

    const interval = setInterval(() => {
      refresh(); // Refresh to pick up any new jobs that might have been started elsewhere
    }, 10000); // Refresh every 10 seconds when there are active jobs

    return () => clearInterval(interval);
  }, [hasActiveJobs, refresh]);

  const startIndexing = async (ws: Workspace) => {
    try {
      const res = await fetch(`/api/workspaces/${ws.id}/index`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "index" })
      });
      const json = await res.json();
      if (!res.ok && !json?.success) throw new Error(json?.message || "Failed to start indexing");
      toast.success("Indexing started", { description: `${ws.repo}:${ws.branch}` });
      refresh();
    } catch (e: any) {
      toast.error("Failed to start indexing", { description: e?.message || "Unknown error" });
    }
  };

  const renderStatusBadge = (status?: string) => {
    const s = (status || "pending").toLowerCase();
    const variant = s === "ready" ? "secondary" : s === "building" ? "outline" : s === "failed" ? "destructive" : "outline";
    return <Badge variant={variant as any}>{status || "pending"}</Badge>;
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Indexing Jobs</h1>
            <p className="text-sm text-muted-foreground">Monitor repository indexing by workspace with real-time updates.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Last updated: {lastRefresh.toLocaleTimeString()}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={refresh}
              disabled={loading}
            >
              <RefreshCw className={`h-3 w-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Suspense fallback={
          <>
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-5 w-16" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between mb-3">
                    <div className="space-y-1">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                    <div className="flex gap-2">
                      <Skeleton className="h-8 w-24" />
                      <Skeleton className="h-8 w-20" />
                    </div>
                  </div>
                  <Separator className="my-3" />
                  <div className="space-y-1">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-3/4" />
                    <Skeleton className="h-3 w-2/3" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </>
        }>
          {workspaces.map((ws) => {
            const p = progressMap[ws.id];
            const effectiveStatus = p?.status || ws.index_status;
            const currentProgress = p?.progress ?? ws.progress ?? 0;
            const currentPhase = p?.phase ?? null;
            const totalFiles = (p as any)?.total_files ?? undefined;
            const processedFiles = (p as any)?.processed_files ?? undefined;
            const totalNodes = (p as any)?.total_nodes ?? undefined;
            const embeddedNodes = (p as any)?.embedded_nodes ?? undefined;

            return (
              <Card key={ws.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">{ws.repo}</CardTitle>
                      <CardDescription>branch: {ws.branch}</CardDescription>
                    </div>
                    {renderStatusBadge(effectiveStatus)}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 mb-3">
                    <div className="flex items-center justify-between text-sm">
                      <div className="text-muted-foreground">
                        <span>Progress:&nbsp;</span>
                        <span className="font-medium">{currentProgress}%</span>
                        {currentPhase && <span className="ml-2 text-xs">({currentPhase})</span>}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="relative">
                        <Progress
                          value={currentProgress}
                          className={`h-3 transition-all duration-700 ease-out ${
                            effectiveStatus === 'building'
                              ? 'progress-building'
                              : effectiveStatus === 'ready'
                              ? 'progress-ready'
                              : effectiveStatus === 'failed'
                              ? 'bg-destructive/20'
                              : 'bg-muted'
                          }`}
                        />
                        {effectiveStatus === 'building' && currentProgress > 0 && (
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/10 to-transparent animate-pulse" />
                        )}
                        {effectiveStatus === 'ready' && (
                          <div className="absolute inset-0 bg-gradient-to-r from-green-400/20 via-green-500/30 to-green-400/20" />
                        )}
                      </div>

                      {/* Progress indicators */}
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1">
                          {effectiveStatus === 'building' && (
                            <div className="flex gap-1">
                              <div className="w-1 h-1 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                              <div className="w-1 h-1 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                              <div className="w-1 h-1 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                            </div>
                          )}
                          {effectiveStatus === 'ready' && (
                            <div className="text-green-600 font-medium">✓ Complete</div>
                          )}
                          {effectiveStatus === 'failed' && (
                            <div className="text-destructive font-medium">✗ Failed</div>
                          )}
                        </div>

                      <div className="flex items-center gap-4">
                        {(typeof totalFiles === 'number' && typeof processedFiles === 'number') && (
                          <div className="text-muted-foreground">{processedFiles}/{totalFiles} files</div>
                        )}
                        {(typeof totalNodes === 'number' && typeof embeddedNodes === 'number') && (
                          <div className="text-muted-foreground">{embeddedNodes}/{totalNodes} chunks</div>
                        )}
                          {currentProgress > 0 && currentProgress < 100 && (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <div className="w-1 h-1 bg-current rounded-full animate-pulse"></div>
                              <span>{Math.round(currentProgress)}%</span>
                            </div>
                          )}
                          {currentProgress === 100 && (
                            <div className="text-green-600 font-medium">100%</div>
                          )}
                        </div>
                      </div>

                      {ws.job_error && (
                        <div className="text-xs text-destructive flex items-center gap-1 bg-destructive/10 p-2 rounded-md">
                          <span className="text-xs">⚠️</span>
                          <span className="font-medium">Error:</span>
                          <span>{ws.job_error}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <Separator className="my-3" />
                  <div className="text-xs text-muted-foreground space-y-1">
                    <div>Last indexed: {ws.last_indexed_at ? new Date(ws.last_indexed_at).toLocaleString() : "—"}</div>
                    <div>Last commit: {ws.last_commit_sha ? ws.last_commit_sha.substring(0, 8) : "—"}</div>
                    {ws.job_started_at && (
                      <div>Started: {new Date(ws.job_started_at).toLocaleString()}</div>
                    )}
                    {ws.job_finished_at && (
                      <div>Finished: {new Date(ws.job_finished_at).toLocaleString()}</div>
                    )}
                    {ws.embed_model && (
                      <div>Model: {ws.embed_model}</div>
                    )}
                    {effectiveStatus === 'failed' && (
                      <div className="pt-2">
                        <Button size="sm" variant="destructive" onClick={() => startIndexing(ws)}>Retry indexing</Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </Suspense>
      </div>
    </div>
  );
}


