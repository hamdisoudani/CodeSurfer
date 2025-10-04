"use client";

import * as React from "react";
import { Suspense } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface RepositorySelectorProps {
  // Repository data
  repos: any[];
  branches: any[];
  
  // Selection state
  selectedRepo: string | null;
  selectedBranch: string | null;
  onRepoChange: (repo: string) => void;
  onBranchChange: (branch: string) => void;
  
  // Workspace management
  workspaceMap: Record<string, Record<string, any>>;
  onStartIndexing?: () => void;
  
  // Loading states
  isLoadingRepos?: boolean;
  isLoadingBranches?: boolean;
  
  // UI configuration
  variant?: "compact" | "full";
  showIndexButton?: boolean;
  disabled?: boolean;
  className?: string;
}

export function RepositorySelector({
  repos,
  branches,
  selectedRepo,
  selectedBranch,
  onRepoChange,
  onBranchChange,
  workspaceMap,
  onStartIndexing,
  isLoadingRepos = false,
  isLoadingBranches = false,
  variant = "full",
  showIndexButton = true,
  disabled = false,
  className
}: RepositorySelectorProps) {
  
  // Get current workspace status
  const currentWorkspace = React.useMemo(() => {
    if (!selectedRepo || !selectedBranch) return null;
    return workspaceMap[selectedRepo]?.[selectedBranch];
  }, [selectedRepo, selectedBranch, workspaceMap]);

  const isReady = currentWorkspace?.index_status === 'ready';
  const isBuilding = currentWorkspace?.index_status === 'building';
  const needsIndexing = selectedRepo && selectedBranch && !isReady && !isBuilding;

  // Handle repo change (reset branch when repo changes)
  const handleRepoChange = (repo: string) => {
    onRepoChange(repo);
    onBranchChange(""); // Reset branch selection
  };

  if (variant === "compact") {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <div className="flex items-center gap-2 text-sm">
          <div className={cn(
            "w-2 h-2 rounded-full",
            isReady ? "bg-green-500" : 
            isBuilding ? "bg-yellow-500 animate-pulse" :
            "bg-gray-400"
          )} />
          <span className="text-muted-foreground">
            {selectedRepo && selectedBranch ? (
              <code className="font-mono bg-muted px-1 py-0.5 rounded text-xs">
                {selectedRepo.split('/').pop()}:{selectedBranch}
              </code>
            ) : (
              "No repository selected"
            )}
          </span>
        </div>
        {needsIndexing && showIndexButton && onStartIndexing && (
          <Button size="sm" variant="outline" onClick={onStartIndexing}>
            <Sparkles className="w-3 h-3 mr-1" />
            Index
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Selection Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Repository Selector */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Repository
          </label>
          <Suspense fallback={
            <div className="h-10 bg-muted/50 rounded-md animate-pulse" />
          }>
            <Select
              value={selectedRepo || ""}
              onValueChange={handleRepoChange}
              disabled={disabled || isLoadingRepos}
            >
              <SelectTrigger className="h-10">
                <SelectValue 
                  placeholder={isLoadingRepos ? "Loading repositories..." : "Select repository..."} 
                />
              </SelectTrigger>
              <SelectContent>
                {repos.map((r: any) => {
                  const hasAnyReady = workspaceMap[r.full_name] && 
                    Object.values(workspaceMap[r.full_name]).some((w: any) => w.index_status === 'ready');
                  
                  return (
                    <SelectItem key={r.id} value={r.full_name}>
                      <div className="flex items-center justify-between gap-3 w-full">
                        <span className="truncate">{r.full_name}</span>
                        <Badge 
                          variant={hasAnyReady ? "secondary" : "outline"}
                          className="ml-2 text-xs"
                        >
                          {hasAnyReady ? "Indexed" : "Unindexed"}
                        </Badge>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </Suspense>
        </div>

        {/* Branch Selector */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Branch
          </label>
          <Suspense fallback={
            <div className="h-10 bg-muted/50 rounded-md animate-pulse" />
          }>
            <Select
              value={selectedBranch || ""}
              onValueChange={onBranchChange}
              disabled={disabled || !selectedRepo || isLoadingBranches}
            >
              <SelectTrigger className="h-10">
                <SelectValue 
                  placeholder={isLoadingBranches ? "Loading branches..." : "Select branch..."} 
                />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b: any) => {
                  const status = selectedRepo ? workspaceMap[selectedRepo]?.[b.name]?.index_status : undefined;
                  const progress = selectedRepo ? workspaceMap[selectedRepo]?.[b.name]?.progress : undefined;
                  
                  let label = 'Not indexed';
                  let variant: "default" | "secondary" | "outline" = 'outline';
                  
                  if (status === 'ready') {
                    label = 'Ready';
                    variant = 'secondary';
                  } else if (status === 'building') {
                    label = progress ? `Indexing ${Math.round(progress)}%` : 'Indexing';
                    variant = 'outline';
                  } else if (status === 'failed') {
                    label = 'Failed';
                    variant = 'outline';
                  }
                  
                  return (
                    <SelectItem key={b.name} value={b.name}>
                      <div className="flex items-center justify-between gap-3 w-full">
                        <span className="truncate">{b.name}</span>
                        <div className="flex items-center gap-2">
                          {status === 'building' && (
                            <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
                          )}
                          <Badge variant={variant} className="text-xs">
                            {label}
                          </Badge>
                        </div>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </Suspense>
        </div>
      </div>

      {/* Status and Actions */}
      {selectedRepo && selectedBranch && (
        <div className="flex items-center justify-between p-3 rounded-md border bg-muted/20">
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-2 h-2 rounded-full",
              isReady ? "bg-green-500" : 
              isBuilding ? "bg-yellow-500 animate-pulse" :
              "bg-gray-400"
            )} />
            <span className="text-sm text-muted-foreground">
              {isReady 
                ? `Repository ${selectedRepo.split('/').pop()}:${selectedBranch} is ready for analysis`
                : isBuilding
                  ? `Indexing ${selectedRepo.split('/').pop()}:${selectedBranch}...`
                  : `Repository ${selectedRepo.split('/').pop()}:${selectedBranch} needs indexing`}
            </span>
          </div>
          
          {needsIndexing && showIndexButton && onStartIndexing && (
            <Button size="sm" onClick={onStartIndexing} variant="outline">
              <Sparkles className="w-4 h-4 mr-1" />
              Start Indexing
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
