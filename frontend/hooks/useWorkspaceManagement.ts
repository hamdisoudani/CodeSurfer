import { useState, useEffect, useMemo, useCallback } from 'react';
import { toast } from 'sonner';

type WorkspaceInfo = {
  id: string;
  repo: string;
  branch: string;
  index_status: 'pending' | 'building' | 'ready' | 'failed' | 'stale';
  last_indexed_at?: string | null;
  last_commit_sha?: string | null;
  progress?: number | null;
  phase?: string | null;
};

interface UseWorkspaceManagementOptions {
  selectedRepo: string | null;
  selectedBranch: string | null;
  threadRepo: string | null;
  threadBranch: string | null;
  selectedThreadId: string | null;
  effectiveInstallationId: string | null;
  status: string;
}

export function useWorkspaceManagement({
  selectedRepo,
  selectedBranch,
  threadRepo,
  threadBranch,
  selectedThreadId,
  effectiveInstallationId,
  status
}: UseWorkspaceManagementOptions) {
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([]);
  const [workspaceMap, setWorkspaceMap] = useState<Record<string, Record<string, WorkspaceInfo>>>({});

  // Helper to rebuild repo->branch map from API response
  const rebuildWorkspaceMap = useCallback((items: any[]): Record<string, Record<string, WorkspaceInfo>> => {
    const map: Record<string, Record<string, WorkspaceInfo>> = {};
    for (const w of items || []) {
      const repo: string = w.repo;
      const branch: string = w.branch || 'main';
      if (!map[repo]) map[repo] = {};
      map[repo][branch] = {
        id: w.id,
        repo,
        branch,
        index_status: w.index_status,
        last_indexed_at: w.last_indexed_at ?? null,
        last_commit_sha: w.last_commit_sha ?? null,
        progress: null,
        phase: null,
      };
    }
    return map;
  }, []);

  // Get current workspace ID (returns undefined in scratch mode - no repo/branch)
  const currentWorkspaceId = useMemo(() => {
    const repo = selectedThreadId ? threadRepo : selectedRepo;
    const branch = selectedThreadId ? threadBranch : selectedBranch;
    // In scratch mode, repo/branch will be null - this is intentional and valid
    if (!repo || !branch) return undefined;
    return workspaceMap[repo]?.[branch]?.id;
  }, [selectedThreadId, threadRepo, threadBranch, selectedRepo, selectedBranch, workspaceMap]);

  // Get current workspace info (returns undefined in scratch mode - no workspace needed)
  const currentWorkspace = useMemo(() => {
    const repo = selectedThreadId ? threadRepo : selectedRepo;
    const branch = selectedThreadId ? threadBranch : selectedBranch;
    // In scratch mode, repo/branch will be null - this is intentional and valid
    if (!repo || !branch) return undefined;
    return workspaceMap[repo]?.[branch];
  }, [selectedThreadId, threadRepo, threadBranch, selectedRepo, selectedBranch, workspaceMap]);

  // Load workspaces on authentication
  useEffect(() => {
    if (status !== "authenticated") return;

    const loadWorkspaces = async () => {
      try {
        const wsRes = await fetch('/api/workspaces');
        const wsData = await wsRes.json();
        const items: any[] = wsData.workspaces || [];
        setWorkspaces(items);
        setWorkspaceMap(rebuildWorkspaceMap(items));
      } catch (error) {
        console.error('Failed to load workspaces:', error);
      }
    };

    loadWorkspaces();
  }, [status, rebuildWorkspaceMap]);

  // Start indexing for current repo/branch
  const startIndexing = useCallback(async (repo?: string, branch?: string) => {
    const targetRepo = repo || selectedRepo;
    const targetBranch = branch || selectedBranch;
    
    if (!targetRepo || !targetBranch || !effectiveInstallationId) {
      toast.error('Missing required information for indexing');
      return false;
    }

    try {
      // Upsert workspace then start indexing
      const up = await fetch('/api/workspaces', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ 
          repo: targetRepo, 
          branch: targetBranch, 
          installation_id: effectiveInstallationId 
        })
      });
      const upJson = await up.json();
      const wsId = upJson?.workspace?.id;
      
      if (!wsId) throw new Error('Failed to upsert workspace');

      const idx = await fetch(`/api/workspaces/${wsId}/index`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ type: 'index' })
      });
      const idxJson = await idx.json();
      
      if (!idx.ok && !idxJson?.success) throw new Error('Failed to start indexing');

      toast.success('Indexing started', { 
        description: `${targetRepo}:${targetBranch}` 
      });

      // Optimistically set status to building
      setWorkspaceMap(prev => ({ 
        ...prev, 
        [targetRepo]: { 
          ...(prev[targetRepo] || {}), 
          [targetBranch]: { 
            id: wsId, 
            repo: targetRepo, 
            branch: targetBranch, 
            index_status: 'building' 
          } 
        }
      }));

      // Open SSE to listen for progress
      try {
        const es = new EventSource(`/api/workspaces/${wsId}/events`);
        es.onmessage = (e) => {
          try {
            const payload = JSON.parse(e.data);
            const status = payload?.index_status || payload?.status;
            const progress = payload?.progress ?? null;
            const phase = payload?.phase ?? null;
            
            setWorkspaceMap(prev => ({
              ...prev,
              [targetRepo]: {
                ...(prev[targetRepo] || {}),
                [targetBranch]: {
                  ...(prev[targetRepo]?.[targetBranch] || { 
                    id: wsId, 
                    repo: targetRepo, 
                    branch: targetBranch 
                  }),
                  index_status: status || prev[targetRepo]?.[targetBranch]?.index_status || 'building',
                  progress,
                  phase,
                }
              }
            }));
            
            if (status === 'ready' || status === 'failed') {
              es.close();
            }
          } catch (err) {
            console.error('Error parsing SSE message:', err);
          }
        };
        
        es.onerror = () => { 
          es.close(); 
        };
      } catch (sseError) {
        console.error('Failed to setup SSE:', sseError);
      }

      return true;
    } catch (e: any) {
      toast.error('Indexing failed to start', { 
        description: e?.message || 'Unknown error' 
      });
      return false;
    }
  }, [selectedRepo, selectedBranch, effectiveInstallationId]);

  // Check if current selection is ready for analysis
  const isCurrentWorkspaceReady = useMemo(() => {
    return currentWorkspace?.index_status === 'ready';
  }, [currentWorkspace]);

  // Check if current selection needs indexing
  const needsIndexing = useMemo(() => {
    if (!selectedRepo || !selectedBranch) return false;
    const workspace = workspaceMap[selectedRepo]?.[selectedBranch];
    return !workspace || workspace.index_status !== 'ready';
  }, [selectedRepo, selectedBranch, workspaceMap]);

  return {
    workspaces,
    workspaceMap,
    currentWorkspaceId,
    currentWorkspace,
    isCurrentWorkspaceReady,
    needsIndexing,
    startIndexing,
    setWorkspaceMap
  };
}
