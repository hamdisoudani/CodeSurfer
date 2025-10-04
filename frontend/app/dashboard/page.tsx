"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SignedIn, SignedOut } from "@/components/auth/Signed";

interface Installation {
  id: string;
  installation_id: string;
  account_login: string;
  account_type: string;
  repository_selection: string;
}

interface Repository {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  description: string;
  default_branch: string;
}

interface Branch {
  name: string;
  commit: {
    sha: string;
    url: string;
  };
  protected: boolean;
}

interface Workspace {
  id: string;
  repo: string;
  branch: string;
  index_status: 'pending' | 'building' | 'ready' | 'failed' | 'stale';
  last_indexed_at?: string;
  last_commit_sha?: string;
  snapshot_id?: string;
  volume_id?: string;
  created_at: string;
  updated_at: string;
}

export default function Dashboard() {
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedInstallation, setSelectedInstallation] = useState<string>("");
  const [selectedRepo, setSelectedRepo] = useState<string>("");
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [indexingProgress, setIndexingProgress] = useState<{[key: string]: number}>({});
  
  // Handle installation callback results
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const installationSuccess = urlParams.get('installation_success');
    const installationError = urlParams.get('installation_error');
    const errorMessage = urlParams.get('error_message');
    const installationId = urlParams.get('installation_id');
    
    if (installationSuccess === 'true') {
      console.log('✅ Installation successful for ID:', installationId);
      // You could show a success toast here
      // toast.success(`GitHub App installed successfully! Installation ID: ${installationId}`);
      
      // Clean up URL parameters
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('installation_success');
      cleanUrl.searchParams.delete('installation_id');
      cleanUrl.searchParams.delete('setup_action');
      window.history.replaceState({}, '', cleanUrl.toString());
      
      // Refresh installations list
      checkInstallations();
    } else if (installationError === 'true') {
      console.error('❌ Installation failed:', errorMessage);
      // You could show an error toast here
      // toast.error(`Installation failed: ${errorMessage}`);
      
      // Clean up URL parameters
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('installation_error');
      cleanUrl.searchParams.delete('error_message');
      window.history.replaceState({}, '', cleanUrl.toString());
    }
  }, []);

  // Check installations and workspaces on component mount
  useEffect(() => {
    checkInstallations();
    fetchWorkspaces();
  }, []);

  const checkInstallations = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/installations/check");
      const data = await res.json();
      if (data.data?.installations) {
        setInstallations(data.data.installations);
      }
    } catch (error) {
      console.error("Failed to check installations:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchRepositories = async (installationId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/installations/repos?installation_id=${installationId}`);
      const data = await res.json();
      if (data.data?.repositories) {
        setRepositories(data.data.repositories);
        setSelectedInstallation(installationId);
        setBranches([]); // Clear branches
        setSelectedRepo("");
      }
    } catch (error) {
      console.error("Failed to fetch repositories:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchBranches = async (repo: string) => {
    if (!selectedInstallation) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/installations/branches?installation_id=${selectedInstallation}&repo=${encodeURIComponent(repo)}`);
      const data = await res.json();
      if (data.data?.branches) {
        setBranches(data.data.branches);
        setSelectedRepo(repo);
      }
    } catch (error) {
      console.error("Failed to fetch branches:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchWorkspaces = async () => {
    try {
      const res = await fetch("/api/workspaces");
      const data = await res.json();
      if (data.workspaces) {
        setWorkspaces(data.workspaces);
      }
    } catch (error) {
      console.error("Failed to fetch workspaces:", error);
    }
  };

  const createWorkspace = async (repo: string, branch: string) => {
    if (!selectedInstallation) {
      console.error("No installation selected");
      return;
    }
    
    setLoading(true);
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          repo,
          branch,
          installation_id: selectedInstallation,
        }),
      });
      
      const data = await res.json();
      if (data.success) {
        console.log("✅ Workspace created:", data.workspace);
        await fetchWorkspaces(); // Refresh workspace list
        return data.workspace;
      } else {
        console.error("Failed to create workspace:", data);
      }
    } catch (error) {
      console.error("Failed to create workspace:", error);
    } finally {
      setLoading(false);
    }
  };

  const startIndexing = async (workspaceId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/index`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ type: "index" }),
      });
      
      const data = await res.json();
      if (data.success) {
        console.log("✅ Indexing started:", data);
        
        // Set up SSE for real-time progress updates
        const eventSource = new EventSource(`/api/workspaces/${workspaceId}/events`);
        
        eventSource.onmessage = (event) => {
          const progressData = JSON.parse(event.data);
          setIndexingProgress(prev => ({
            ...prev,
            [workspaceId]: progressData.progress || 0
          }));
          
          // Update workspace status
          if (progressData.status === 'ready' || progressData.status === 'failed') {
            eventSource.close();
            fetchWorkspaces(); // Refresh to get updated status
          }
        };
        
        eventSource.onerror = () => {
          console.log("SSE connection closed");
          eventSource.close();
        };
        
        await fetchWorkspaces(); // Refresh to show 'building' status
      } else {
        console.error("Failed to start indexing:", data);
      }
    } catch (error) {
      console.error("Failed to start indexing:", error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusStyles = {
      pending: "bg-yellow-100 text-yellow-800",
      building: "bg-blue-100 text-blue-800 animate-pulse",
      ready: "bg-green-100 text-green-800",
      failed: "bg-red-100 text-red-800",
      stale: "bg-gray-100 text-gray-800",
    };
    
    return (
      <span className={`px-2 py-1 text-xs rounded-full ${statusStyles[status as keyof typeof statusStyles] || statusStyles.pending}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="min-h-screen p-6">
      <SignedOut>
        <div className="grid place-items-center h-screen">
          <Card>
            <CardHeader>
              <CardTitle>Please Sign In</CardTitle>
            </CardHeader>
            <CardContent>
              <p>You need to sign in to access the dashboard.</p>
            </CardContent>
          </Card>
        </div>
      </SignedOut>

      <SignedIn>
        <div className="max-w-6xl mx-auto space-y-6">
          <h1 className="text-3xl font-bold">Dashboard</h1>

          {/* Existing Workspaces */}
          {workspaces.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Your Workspaces</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4">
                  {workspaces.map((workspace) => (
                    <div key={workspace.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <strong className="text-lg">{workspace.repo}</strong>
                          <span className="text-sm text-muted-foreground">({workspace.branch})</span>
                          {getStatusBadge(workspace.index_status)}
                        </div>
                        
                        <div className="text-sm text-muted-foreground space-y-1">
                          <div>Created: {new Date(workspace.created_at).toLocaleDateString()}</div>
                          {workspace.last_indexed_at && (
                            <div>Last indexed: {new Date(workspace.last_indexed_at).toLocaleDateString()}</div>
                          )}
                          {workspace.last_commit_sha && (
                            <div className="font-mono">Commit: {workspace.last_commit_sha.substring(0, 8)}</div>
                          )}
                        </div>

                        {/* Progress bar for building workspaces */}
                        {workspace.index_status === 'building' && indexingProgress[workspace.id] !== undefined && (
                          <div className="mt-3">
                            <div className="flex justify-between text-sm mb-1">
                              <span>Indexing progress</span>
                              <span>{indexingProgress[workspace.id]}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div
                                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${indexingProgress[workspace.id]}%` }}
                              ></div>
                            </div>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex gap-2">
                        {workspace.index_status === 'ready' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              // Navigate to main page with workspace context
                              const searchParams = new URLSearchParams();
                              searchParams.set('repo', workspace.repo);
                              searchParams.set('branch', workspace.branch);
                              window.open(`/?${searchParams.toString()}`, '_blank');
                            }}
                          >
                            Open Chat
                          </Button>
                        )}
                        {(workspace.index_status === 'pending' || workspace.index_status === 'failed' || workspace.index_status === 'stale') && (
                          <Button
                            size="sm"
                            onClick={() => startIndexing(workspace.id)}
                            disabled={loading}
                          >
                            {workspace.index_status === 'failed' ? 'Retry Index' : 'Start Indexing'}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* GitHub App Installations */}
          <Card>
            <CardHeader>
              <CardTitle>GitHub App Installations</CardTitle>
            </CardHeader>
            <CardContent>
              {loading && <p>Loading...</p>}
              {installations.length === 0 && !loading && (
                <p>No GitHub App installations found. Please install the app first.</p>
              )}
              <div className="grid gap-2">
                {installations.map((installation) => (
                  <div key={installation.id} className="flex items-center justify-between p-3 border rounded">
                    <div>
                      <strong>{installation.account_login}</strong> ({installation.account_type})
                      <div className="text-sm text-muted-foreground">
                        {installation.repository_selection} repositories
                      </div>
                    </div>
                    <Button
                      onClick={() => fetchRepositories(installation.installation_id)}
                      disabled={loading}
                    >
                      View Repositories
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Repositories */}
          {repositories.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Repositories</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2">
                  {repositories.map((repo) => (
                    <div key={repo.id} className="flex items-center justify-between p-3 border rounded">
                      <div>
                        <strong>{repo.full_name}</strong>
                        {repo.private && <span className="ml-2 text-xs bg-yellow-100 px-2 py-1 rounded">Private</span>}
                        <div className="text-sm text-muted-foreground">{repo.description}</div>
                      </div>
                      <Button
                        onClick={() => fetchBranches(repo.full_name)}
                        disabled={loading}
                      >
                        View Branches
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Branches */}
          {branches.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Branches for {selectedRepo}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2">
                  {branches.map((branch) => {
                    // Check if workspace already exists for this repo+branch combination
                    const existingWorkspace = workspaces.find(w => w.repo === selectedRepo && w.branch === branch.name);
                    
                    return (
                      <div key={branch.name} className="flex items-center justify-between p-3 border rounded">
                        <div>
                          <strong>{branch.name}</strong>
                          {branch.protected && <span className="ml-2 text-xs bg-green-100 px-2 py-1 rounded">Protected</span>}
                          {existingWorkspace && (
                            <span className="ml-2 text-xs bg-blue-100 px-2 py-1 rounded">
                              Workspace exists ({existingWorkspace.index_status})
                            </span>
                          )}
                          <div className="text-sm text-muted-foreground font-mono">
                            {branch.commit.sha.substring(0, 8)}
                          </div>
                        </div>
                        
                        <div className="flex gap-2">
                          {existingWorkspace ? (
                            <>
                              {existingWorkspace.index_status === 'ready' && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    // Navigate to main page with workspace context
                                    const searchParams = new URLSearchParams();
                                    searchParams.set('repo', selectedRepo);
                                    searchParams.set('branch', branch.name);
                                    window.open(`/?${searchParams.toString()}`, '_blank');
                                  }}
                                >
                                  Open Chat
                                </Button>
                              )}
                              {(existingWorkspace.index_status === 'pending' || existingWorkspace.index_status === 'failed' || existingWorkspace.index_status === 'stale') && (
                                <Button
                                  size="sm"
                                  onClick={() => startIndexing(existingWorkspace.id)}
                                  disabled={loading}
                                >
                                  {existingWorkspace.index_status === 'failed' ? 'Retry Index' : 'Start Indexing'}
                                </Button>
                              )}
                            </>
                          ) : (
                            <Button
                              size="sm"
                              onClick={async () => {
                                const workspace = await createWorkspace(selectedRepo, branch.name);
                                if (workspace) {
                                  // Automatically start indexing for new workspaces
                                  startIndexing(workspace.id);
                                }
                              }}
                              disabled={loading}
                            >
                              Create Workspace & Index
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </SignedIn>
    </div>
  );
}
