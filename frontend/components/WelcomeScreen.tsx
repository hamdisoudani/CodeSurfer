"use client";

import * as React from "react";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Send, Sparkles, Loader2, Shield, Search, Zap, Code, FolderGit } from "lucide-react";
import { cn } from "@/lib/utils";

export type ConversationMode = 'scratch' | 'repo';

interface WelcomeScreenProps {
  // Mode selection
  mode: ConversationMode;
  onModeChange: (mode: ConversationMode) => void;
  
  // Repository selection
  repos: any[];
  branches: any[];
  selectedRepo: string | null;
  selectedBranch: string | null;
  onRepoChange: (repo: string) => void;
  onBranchChange: (branch: string) => void;
  
  // Workspace management
  workspaceMap: Record<string, Record<string, any>>;
  onStartIndexing: () => void;
  
  // Message input
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  
  // Loading states
  isLoadingRepos?: boolean;
  isLoadingBranches?: boolean;
  isLoading?: boolean;
  
  className?: string;
}

const WelcomeScreenComponent: React.FC<WelcomeScreenProps> = ({
  mode,
  onModeChange,
  repos,
  branches,
  selectedRepo,
  selectedBranch,
  onRepoChange,
  onBranchChange,
  workspaceMap,
  onStartIndexing,
  input,
  onInputChange,
  onSubmit,
  isLoadingRepos = false,
  isLoadingBranches = false,
  isLoading = false,
  className
}) => {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  
  // Check if current selection is ready
  const currentWorkspace = React.useMemo(() => {
    if (!selectedRepo || !selectedBranch) return null;
    return workspaceMap[selectedRepo]?.[selectedBranch];
  }, [selectedRepo, selectedBranch, workspaceMap]);

  const isReady = currentWorkspace?.index_status === 'ready';
  const isBuilding = currentWorkspace?.index_status === 'building';
  const needsIndexing = selectedRepo && selectedBranch && !isReady && !isBuilding;
  const hasSelection = selectedRepo && selectedBranch;
  
  // Updated canSubmit logic: scratch mode only needs input, repo mode needs workspace ready
  const canSubmit = mode === 'scratch'
    ? input.trim() && !isLoading
    : hasSelection && isReady && input.trim() && !isLoading;

  // Character count for context awareness
  const charCount = input.length;

  // Handle form submission - memoized
  const handleSubmit = React.useCallback(() => {
    if (canSubmit) {
      onSubmit();
    }
  }, [canSubmit, onSubmit]);

  // Handle keyboard shortcuts - memoized
  const handleKeyDown = React.useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  // Auto-resize textarea - debounced for performance
  React.useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    
    const resizeTimeout = setTimeout(() => {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
    }, 0);
    
    return () => clearTimeout(resizeTimeout);
  }, [input]);

  return (
    <div className={cn("flex items-center justify-center py-8 px-4", className)}>
      <div className="w-full max-w-3xl space-y-8">
        {/* Hero Section */}
        <div className="text-center space-y-4">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 blur-3xl opacity-50"></div>
            <h1 className="relative text-4xl md:text-5xl font-bold tracking-tight">
              {mode === 'scratch' ? 'Build projects, powered by AI' : 'Security analysis, powered by AI'}
            </h1>
          </div>
          <p className="text-muted-foreground text-base md:text-lg max-w-2xl mx-auto">
            {mode === 'scratch' 
              ? 'Start from scratch and build complete projects with AI assistance'
              : 'Connect your repository and let CodeSurf identify vulnerabilities, analyze dependencies, and secure your codebase'
            }
          </p>
        </div>

        {/* Mode Toggle */}
        <div className="flex items-center justify-center gap-3">
          <Button
            variant={mode === 'repo' ? 'default' : 'outline'}
            onClick={() => onModeChange('repo')}
            className="gap-2"
            size="sm"
          >
            <FolderGit className="w-4 h-4" />
            Start from Repository
          </Button>
          <Button
            variant={mode === 'scratch' ? 'default' : 'outline'}
            onClick={() => onModeChange('scratch')}
            className="gap-2"
            size="sm"
          >
            <Code className="w-4 h-4" />
            Start from Scratch
          </Button>
        </div>

        {/* Main Input Form - Professional Design */}
        <Card className="relative p-3 border-border/60 shadow-lg bg-card/50 backdrop-blur-sm">
          {/* Text input */}
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            placeholder={mode === 'scratch' 
              ? "Describe the project you want to build... (e.g., 'Build a React todo app with authentication')"
              : "Ask me to find vulnerabilities, review dependencies, or analyze specific files..."
            }
            onKeyDown={handleKeyDown}
            disabled={mode === 'repo' ? (!hasSelection || isLoading) : isLoading}
            className={cn(
              "border-0 bg-transparent resize-none px-3 py-3 min-h-[60px] max-h-40 overflow-y-auto",
              "placeholder:text-muted-foreground/60 focus-visible:ring-0 focus-visible:ring-offset-0",
              "text-base leading-relaxed disabled:opacity-60 disabled:cursor-not-allowed"
            )}
            style={{ height: 'auto' }}
          />

          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3 px-1">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {/* Repository Selection - Only in Repo Mode */}
              {mode === 'repo' && (
                <>
                  <Suspense fallback={
                    <div className="h-9 w-36 bg-muted/50 rounded-lg animate-pulse" />
                  }>
                    <Select
                      value={selectedRepo || ""}
                      onValueChange={onRepoChange}
                      disabled={isLoadingRepos}
                    >
                      <SelectTrigger className={cn(
                        "h-9 text-sm border-border/70 bg-muted/40 hover:bg-muted/60 transition-colors flex-1 max-w-[200px]",
                        selectedRepo && "border-primary/30"
                      )}>
                        <SelectValue placeholder={isLoadingRepos ? "Loading repos..." : "Select repository"} />
                      </SelectTrigger>
                      <SelectContent>
                        {repos.map((r: any) => {
                          const hasAnyReady = workspaceMap[r.full_name] && 
                            Object.values(workspaceMap[r.full_name]).some((w: any) => w.index_status === 'ready');
                          return (
                            <SelectItem key={r.id} value={r.full_name}>
                              <div className="flex items-center justify-between gap-3 w-full">
                                <span className="truncate">{r.full_name}</span>
                                {hasAnyReady && (
                                  <Badge variant="secondary" className="text-xs">Ready</Badge>
                                )}
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </Suspense>

                  {/* Branch Selection */}
                  <Suspense fallback={
                    <div className="h-9 w-28 bg-muted/50 rounded-lg animate-pulse" />
                  }>
                    <Select
                      value={selectedBranch || ""}
                      onValueChange={onBranchChange}
                      disabled={!selectedRepo || isLoadingBranches}
                    >
                      <SelectTrigger className={cn(
                        "h-9 text-sm border-border/70 bg-muted/40 hover:bg-muted/60 transition-colors flex-1 max-w-[160px]",
                        selectedBranch && "border-primary/30"
                      )}>
                        <SelectValue placeholder={isLoadingBranches ? "Loading..." : "Select branch"} />
                      </SelectTrigger>
                      <SelectContent>
                        {branches.map((b: any) => {
                          const status = selectedRepo ? workspaceMap[selectedRepo]?.[b.name]?.index_status : undefined;
                          const label = status === 'ready' ? 'Ready' : 
                                       status === 'building' ? 'Indexing' : 
                                       'Not indexed';
                          const variant = status === 'ready' ? 'secondary' : 
                                         status === 'building' ? 'outline' : 'outline';
                          
                          return (
                            <SelectItem key={b.name} value={b.name}>
                              <div className="flex items-center justify-between gap-3 w-full">
                                <span className="truncate">{b.name}</span>
                                <Badge variant={variant} className="text-xs">{label}</Badge>
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </Suspense>
                </>
              )}

              {/* Scratch Mode Indicator */}
              {mode === 'scratch' && (
                <Badge variant="secondary" className="gap-1.5">
                  <Code className="w-3 h-3" />
                  Scratch Mode - No repository needed
                </Badge>
              )}

              {/* Status/Action Badges - Only in Repo Mode */}
              {mode === 'repo' && hasSelection && (
                <div className="hidden md:flex items-center gap-2">
                  {isReady && (
                    <Badge variant="secondary" className="gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                      Ready
                    </Badge>
                  )}
                  {isBuilding && (
                    <Badge variant="outline" className="gap-1.5">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Indexing...
                    </Badge>
                  )}
                  {needsIndexing && (
                    <Button 
                      size="sm" 
                      onClick={onStartIndexing} 
                      variant="outline"
                      className="h-7 text-xs"
                    >
                      <Sparkles className="w-3 h-3 mr-1" />
                      Index
                    </Button>
                  )}
                </div>
              )}

              {/* Character Count */}
              {charCount > 0 && (
                <Badge 
                  variant="outline" 
                  className="text-xs text-muted-foreground border-border/50"
                  title={`${charCount} characters`}
                >
                  {charCount.toLocaleString()} chars
                </Badge>
              )}
            </div>

            {/* Send Button */}
            <Button 
              onClick={handleSubmit} 
              disabled={!canSubmit} 
              size="icon" 
              className={cn(
                "h-10 w-10 rounded-xl shadow-md flex-shrink-0",
                "transition-all duration-200",
                canSubmit && "bg-primary hover:bg-primary/90 hover:shadow-lg hover:scale-105"
              )}
              title={mode === 'scratch' 
                ? "Send message" 
                : (!hasSelection ? "Select repository and branch first" : !isReady ? "Index required" : "Send message")
              }
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
        </Card>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-5 text-center hover:shadow-md transition-shadow border-border/60">
            <div className="mx-auto w-12 h-12 mb-3 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Search className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="font-semibold text-sm mb-2">Vulnerability Detection</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Find security issues across your codebase with AI-powered analysis
            </p>
          </Card>
          
          <Card className="p-5 text-center hover:shadow-md transition-shadow border-border/60">
            <div className="mx-auto w-12 h-12 mb-3 rounded-xl bg-green-500/10 flex items-center justify-center">
              <Shield className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <h3 className="font-semibold text-sm mb-2">Security Audit</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Comprehensive security analysis with actionable recommendations
            </p>
          </Card>
          
          <Card className="p-5 text-center hover:shadow-md transition-shadow border-border/60">
            <div className="mx-auto w-12 h-12 mb-3 rounded-xl bg-purple-500/10 flex items-center justify-center">
              <Zap className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
            <h3 className="font-semibold text-sm mb-2">Automated Fixes</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              AI-powered security improvements and code suggestions
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
};

// Memoize to prevent re-renders when parent updates
export const WelcomeScreen = React.memo(WelcomeScreenComponent);
