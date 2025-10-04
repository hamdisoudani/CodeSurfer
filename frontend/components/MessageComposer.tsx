"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Send, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface MessageComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  placeholder?: string;
  contextTokens?: number;
  connectionStatus?: {
    isConnected: boolean;
    repo?: string;
    branch?: string;
  };
  showIndexButton?: boolean;
  onStartIndexing?: () => void;
  sidebarWidth?: number;
  className?: string;
  onHeightChange?: (height: number) => void;
}

export function MessageComposer({
  value,
  onChange,
  onSubmit,
  disabled = false,
  isLoading = false,
  placeholder = "Ask me about security vulnerabilities, code analysis, or specific files...",
  contextTokens = 0,
  connectionStatus,
  showIndexButton = false,
  onStartIndexing,
  sidebarWidth = 360,
  className,
  onHeightChange
}: MessageComposerProps) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Handle keyboard shortcuts - memoized
  const handleKeyDown = React.useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && value.trim()) {
        onSubmit();
      }
    }
  }, [disabled, value, onSubmit]);

  // Auto-resize textarea - use RAF for better performance
  React.useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    
    requestAnimationFrame(() => {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`; // Max height of 160px
    });
  }, [value]);

  // Report composer height upstream to avoid messages being hidden (throttled)
  React.useEffect(() => {
    if (!onHeightChange) return;
    const el = containerRef.current;
    if (!el) return;

    let resizeTimeout: NodeJS.Timeout;

    const ro = new ResizeObserver((entries) => {
      // Clear previous timeout to throttle resize events
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }

      resizeTimeout = setTimeout(() => {
        const h = entries[0]?.contentRect?.height || 0;
        onHeightChange(h);
      }, 16); // ~60fps throttling
    });

    ro.observe(el);
    // Initial
    onHeightChange(el.getBoundingClientRect().height);

    return () => {
      ro.disconnect();
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
    };
  }, [onHeightChange]);

  // Get context token color based on usage - memoized
  const getTokenColor = React.useMemo(() => {
    if (contextTokens > 24000) return "bg-red-100 text-red-700 border-red-200";
    if (contextTokens > 16000) return "bg-yellow-100 text-yellow-800 border-yellow-200";
    return "bg-muted text-muted-foreground border-border";
  }, [contextTokens]);

  return (
    <div 
      ref={containerRef}
      className={cn(
        // Fixed docked composer; only the input floats
        "fixed right-0 bottom-0 transition-all duration-300 z-10 pointer-events-none",
        className
      )}
      style={{ left: `${sidebarWidth}px` }}
    >
      <div className="max-w-2xl md:max-w-3xl lg:max-w-4xl xl:max-w-4xl mx-auto px-4 py-3 pointer-events-auto">
        {/* Container with subtle card appearance */}
        <div className="relative rounded-2xl p-2 border border-border/40 shadow-sm bg-background/70 supports-[backdrop-filter]:bg-background/50 backdrop-blur-md">
          {/* Text input */}
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            className={cn(
              // Seamless textarea; internal scroll when exceeding max height
              "border-0 bg-transparent resize-none px-3 py-3 min-h-[60px] max-h-40 overflow-y-auto",
              "placeholder:text-muted-foreground/60 focus-visible:ring-0 focus-visible:ring-offset-0",
              "text-base leading-relaxed"
            )}
            style={{ height: 'auto' }}
          />

          {/* Toolbar - sits below the textarea to avoid overlap */}
          <div className="mt-2 flex items-center justify-between px-1">
            <div className="flex items-center gap-2 min-w-0">
              {/* Connection chip */}
              {connectionStatus?.isConnected && connectionStatus.repo && (
                <Badge
                  variant="outline"
                  className="hidden sm:flex items-center gap-1 text-xs bg-background/80 border-border/70"
                  title={`Connected to ${connectionStatus.repo}${connectionStatus.branch ? `:${connectionStatus.branch}` : ''}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  <code className="font-mono truncate max-w-[200px]">
                    {connectionStatus.repo}{connectionStatus.branch ? `:${connectionStatus.branch}` : ''}
                  </code>
                </Badge>
              )}
              {/* Context size indicator */}
              {contextTokens > 0 && (
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs font-medium border transition-colors",
                    getTokenColor
                  )}
                  title={`Approximate tokens in context: ${contextTokens.toLocaleString()}`}
                >
                  {contextTokens.toLocaleString()} tokens
                </Badge>
              )}
            </div>

            {/* Send */}
            <Button 
              onClick={onSubmit} 
              disabled={disabled || !value.trim() || isLoading} 
              size="icon" 
              className={cn(
                "w-9 h-9 bg-primary hover:bg-primary/90 rounded-lg shadow-sm",
                "transition-all duration-200 disabled:opacity-50"
              )}
              title="Send"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {/* Index recommendation */}
        {showIndexButton && onStartIndexing && (
          <div className="mt-2 flex items-center justify-between p-3 rounded-md border bg-muted/30">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
              <span className="text-xs text-muted-foreground">
                This branch is not indexed yet. Indexing improves accuracy and speed.
              </span>
            </div>
            <Button size="sm" onClick={onStartIndexing} variant="outline">
              Index Now
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
