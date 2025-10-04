import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  MessageSquare,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Pause,
  Play,
  GitBranch,
  Calendar,
  User
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface ThreadData {
  thread_id: string;
  status?: 'idle' | 'executing' | 'completed' | 'error' | 'interrupted';
  metadata?: {
    user_id?: string;
    repo?: string;
    branch?: string;
    created_at?: string;
    updated_at?: string;
    message_count?: number;
  };
  last_message?: {
    content?: string;
    role?: string;
    timestamp?: string;
  };
}

interface ThreadItemProps {
  thread: ThreadData;
  isSelected: boolean;
  // onClick kept for backward compatibility during migration
  onClick?: () => void;
  // Current sidebar width in pixels; used to adapt size/density of each item
  sidebarWidth?: number;
}

const statusConfig = {
  idle: {
    icon: Clock,
    label: "Idle",
    color: "text-muted-foreground",
    bgColor: "bg-muted/50",
    dotColor: "bg-gray-400"
  },
  executing: {
    icon: Loader2,
    label: "Executing",
    color: "text-blue-600",
    bgColor: "bg-blue-50 dark:bg-blue-950/50",
    dotColor: "bg-blue-500",
    animate: "animate-spin"
  },
  completed: {
    icon: CheckCircle2,
    label: "Completed",
    color: "text-green-600",
    bgColor: "bg-green-50 dark:bg-green-950/50",
    dotColor: "bg-green-500"
  },
  error: {
    icon: AlertCircle,
    label: "Error",
    color: "text-red-600",
    bgColor: "bg-red-50 dark:bg-red-950/50",
    dotColor: "bg-red-500"
  },
  interrupted: {
    icon: Pause,
    label: "Interrupted",
    color: "text-orange-600",
    bgColor: "bg-orange-50 dark:bg-orange-950/50",
    dotColor: "bg-orange-500"
  }
};

function formatTimeAgo(timestamp?: string): string {
  if (!timestamp) return "";
  
  const now = new Date();
  const time = new Date(timestamp);
  const diffInSeconds = Math.floor((now.getTime() - time.getTime()) / 1000);
  
  if (diffInSeconds < 60) return "Just now";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  
  return time.toLocaleDateString();
}

function truncateContent(content?: string, maxLength: number = 40): string {
  if (!content) return "No recent activity";
  const cleaned = content.replace(/^\s+|\s+$/g, '').replace(/\s+/g, ' ');
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength)}...` : cleaned;
}

export function generateConversationTitle(thread: ThreadData): string {
  // Try to extract a meaningful title from the last message content
  const lastMessage = thread.last_message?.content;
  const repo = thread.metadata?.repo;
  
  if (lastMessage) {
    // Clean and extract first meaningful sentence
    const cleaned = lastMessage
      .replace(/^\s*#+\s*/gm, '') // Remove markdown headers
      .replace(/^\s*[-*]\s*/gm, '') // Remove list markers
      .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold markdown
      .trim();
    
    const sentences = cleaned.split(/[.!?]+/).filter(s => s.trim().length > 10);
    if (sentences.length > 0) {
      const title = sentences[0].trim();
      // Keep titles shorter to prevent overflow - max 35 characters for sidebar
      return title.length > 35 ? `${title.slice(0, 32)}...` : title;
    }
  }
  
  // Fallback to repo-based title
  if (repo) {
    const repoName = repo.split('/').pop() || repo;
    const title = `Analysis of ${repoName}`;
    return title.length > 35 ? `${title.slice(0, 32)}...` : title;
  }
  
  // Final fallback
  return "Security Analysis";
}

// Helper function to get full title for tooltips
export function getFullConversationTitle(thread: ThreadData): string {
  const lastMessage = thread.last_message?.content;
  const repo = thread.metadata?.repo;
  
  if (lastMessage) {
    const cleaned = lastMessage
      .replace(/^\s*#+\s*/gm, '')
      .replace(/^\s*[-*]\s*/gm, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .trim();
    
    const sentences = cleaned.split(/[.!?]+/).filter(s => s.trim().length > 10);
    if (sentences.length > 0) {
      const title = sentences[0].trim();
      // Return first 80 characters for tooltip
      return title.length > 80 ? `${title.slice(0, 77)}...` : title;
    }
  }
  
  if (repo) {
    return `Security Analysis of ${repo}`;
  }
  
  return "Security Analysis";
}

const ThreadItemComponent = ({ thread, isSelected, onClick, sidebarWidth = 360 }: ThreadItemProps) => {
  const status = thread.status || 'idle';
  const config = statusConfig[status];
  const StatusIcon = config.icon;
  
  // Memoize expensive title generation
  const conversationTitle = React.useMemo(() => generateConversationTitle(thread), [thread]);
  const fullTitle = React.useMemo(() => getFullConversationTitle(thread), [thread]);
  
  const repo = thread.metadata?.repo;
  const branch = thread.metadata?.branch;
  const messageCount = thread.metadata?.message_count || 0;
  const lastMessageTime = thread.last_message?.timestamp || thread.metadata?.updated_at;
  const lastMessageContent = thread.last_message?.content;

  // Responsiveness driven by sidebar width
  const isCompact = sidebarWidth < 300; // tighten paddings/typography
  const isNarrow = sidebarWidth < 250;  // smallest readable size
  const dynamicPadding = isCompact ? 'p-3' : 'p-4';
  const dynamicSpacing = isCompact ? 'space-y-2' : 'space-y-3';
  const titleSize = isNarrow ? 'text-xs' : 'text-sm';
  const showPreview = sidebarWidth > 200;
  const showRepository = sidebarWidth > 180;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href={`/c/${thread.thread_id}`}
            className={cn(
              "group relative w-full transition-all duration-200 cursor-pointer overflow-hidden rounded-lg block no-underline",
              "hover:bg-accent/50",
              isSelected && "bg-accent"
            )}
            onClick={onClick}
          >
            {/* Clean left indicator for selected state */}
            {isSelected && (
              <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary rounded-r-sm" />
            )}
            
            <div className="px-2.5 py-2.5">
              {/* Main content - simplified layout */}
              <div className="flex items-start gap-2">
                {/* Status indicator */}
                <div className={cn(
                  'w-2 h-2 rounded-full flex-shrink-0 mt-1',
                  config.dotColor,
                  status === 'executing' && "animate-pulse"
                )} />
                
                {/* Content - more compact */}
                <div className="flex-1 min-w-0">
                  {/* Title and time on same line */}
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <h3 
                      className={cn(
                        'font-medium text-xs truncate flex-1',
                        isSelected ? "text-foreground" : "text-foreground/90"
                      )}
                      title={fullTitle}
                    >
                      {conversationTitle}
                    </h3>
                    {sidebarWidth > 200 && (
                      <span className="text-xs text-muted-foreground/60 whitespace-nowrap ml-1">
                        {formatTimeAgo(lastMessageTime)}
                      </span>
                    )}
                  </div>
                  
                  {/* Repository info - more compact */}
                  {showRepository && repo && (
                    <div className="flex items-center gap-1 mb-1">
                      <GitBranch className="w-2.5 h-2.5 text-muted-foreground/50 flex-shrink-0" />
                      <span className="text-xs text-muted-foreground/70 truncate font-mono">
                        {repo.split('/').pop()}{branch ? `:${branch}` : ''}
                      </span>
                    </div>
                  )}
                  
                  {/* Bottom row - message count and status */}
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1">
                      <MessageSquare className="w-2.5 h-2.5 text-muted-foreground/50" />
                      <span className="text-xs text-muted-foreground/70">
                        {messageCount} msg{messageCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                    
                    {/* Status badge - icon only for compact */}
                    <div className={cn(
                      'flex items-center px-1 py-0.5 rounded text-xs',
                      status === 'executing' && 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
                      status === 'completed' && 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300',
                      status === 'error' && 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300',
                      status === 'idle' && 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                    )}>
                      <StatusIcon className={cn('w-2.5 h-2.5', status === 'executing' && 'animate-spin')} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-80">
          <div className="space-y-1">
            <div className="font-medium">{fullTitle}</div>
            <div className="text-xs text-muted-foreground">
              Status: {config.label}
            </div>
            {repo && (
              <div className="text-xs text-muted-foreground">
                Repository: {repo}
                {branch && ` (${branch})`}
              </div>
            )}
            {lastMessageTime && (
              <div className="text-xs text-muted-foreground">
                Last activity: {new Date(lastMessageTime).toLocaleString()}
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

// Memoize to prevent re-renders when sibling threads update
export const ThreadItem = React.memo(ThreadItemComponent, (prevProps, nextProps) => {
  return (
    prevProps.thread.thread_id === nextProps.thread.thread_id &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.sidebarWidth === nextProps.sidebarWidth &&
    prevProps.thread.status === nextProps.thread.status &&
    prevProps.thread.last_message?.content === nextProps.thread.last_message?.content &&
    prevProps.thread.metadata?.message_count === nextProps.thread.metadata?.message_count
  );
});
