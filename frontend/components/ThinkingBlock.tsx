"use client";

import * as React from "react";
import { Sparkles, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface ThinkingBlockProps {
  content: string;
  isCompleted?: boolean;
  className?: string;
}

export function ThinkingBlock({ content, isCompleted = true, className }: ThinkingBlockProps) {
  const [isExpanded, setIsExpanded] = React.useState(false);

  // Extract thinking content (remove <think> or </think> tags if present)
  const cleanContent = React.useMemo(() => {
    return content
      .replace(/<\/?think>/gi, '')
      .trim();
  }, [content]);

  // Smart preview: first line or first ~80 characters
  const preview = React.useMemo(() => {
    const firstLine = cleanContent.split('\n')[0];
    if (firstLine.length <= 80) return firstLine;
    return cleanContent.substring(0, 80) + '...';
  }, [cleanContent]);

  return (
    <div 
      className={cn(
        "group relative border-l-2 border-violet-300 dark:border-violet-700/50 bg-gradient-to-r from-violet-50/40 to-transparent dark:from-violet-950/20 dark:to-transparent rounded-r-lg transition-all duration-200 hover:from-violet-50/60 dark:hover:from-violet-950/30",
        className
      )}
    >
      {/* Collapsed state - just a subtle indicator */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full text-left px-4 py-2.5 flex items-start gap-3 group/btn"
      >
        {/* Icon */}
        <div className="flex-shrink-0 mt-0.5">
          <div className="w-5 h-5 rounded-md bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center group-hover/btn:bg-violet-200 dark:group-hover/btn:bg-violet-800/50 transition-colors">
            <Sparkles className="w-3 h-3 text-violet-600 dark:text-violet-400" />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-violet-700 dark:text-violet-300">
              Thinking
            </span>
            <span className="text-[10px] text-violet-500/60 dark:text-violet-400/60">
              {isCompleted ? "• Completed" : "• Processing"}
            </span>
          </div>
          
          {!isExpanded && (
            <p className="text-xs text-muted-foreground/70 line-clamp-1 font-normal">
              {preview}
            </p>
          )}
        </div>

        {/* Expand indicator */}
        <div className="flex-shrink-0 mt-1">
          <ChevronDown 
            className={cn(
              "w-3.5 h-3.5 text-violet-400 dark:text-violet-500 transition-transform duration-200",
              isExpanded && "rotate-180"
            )}
          />
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 pb-3 pt-0 pl-12">
          <div className="text-[11px] leading-relaxed text-muted-foreground/80 whitespace-pre-wrap font-mono bg-muted/30 rounded-md p-3 border border-border/40 max-h-[400px] overflow-y-auto">
            {cleanContent}
          </div>
        </div>
      )}
    </div>
  );
}

// Utility to detect and extract thinking blocks from message content
export function extractThinkingBlocks(content: string): {
  thinking: string[];
  cleanContent: string;
} {
  const thinking: string[] = [];
  let cleanContent = content;

  // Pattern 1: Standard <think>...</think>
  const standardRegex = /<think>([\s\S]*?)<\/think>/gi;
  let match;
  while ((match = standardRegex.exec(content)) !== null) {
    thinking.push(match[1].trim());
  }
  cleanContent = cleanContent.replace(standardRegex, '').trim();

  // Pattern 2: Content ending with </think> (missing opening tag)
  // This handles cases where thinking starts at the beginning without <think>
  if (thinking.length === 0 && content.includes('</think>')) {
    const parts = content.split('</think>');
    if (parts.length >= 2) {
      // First part before </think> is the thinking
      const thinkPart = parts[0].trim();
      if (thinkPart) {
        thinking.push(thinkPart);
      }
      // Everything after is clean content
      cleanContent = parts.slice(1).join('').trim();
    }
  }

  // Pattern 3: Content starting with <think> but no closing tag (streaming/incomplete)
  if (thinking.length === 0 && content.startsWith('<think>')) {
    const withoutTag = content.substring(7).trim(); // Remove "<think>"
    // If it looks like thinking content (long enough), extract it
    if (withoutTag.length > 50) {
      thinking.push(withoutTag);
      cleanContent = '';
    }
  }

  return { thinking, cleanContent };
}

