"use client";

import * as React from "react";
import { Bot, Loader2, Zap, Code, Shield, GitBranch } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface TypingIndicatorProps {
  isVisible?: boolean;
  currentAgent?: string;
  currentAction?: string;
  toolsExecuting?: Array<{
    id: string;
    name: string;
    status: string;
  }>;
  className?: string;
}

// Agent information mapping
const agentInfo = {
  'full-stack-editor': {
    name: 'Code Rider',
    icon: Code,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    description: 'Code analysis and implementation'
  },
  'security-reviewer': {
    name: 'Wave Guardian', 
    icon: Shield,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    description: 'Security audit and vulnerability assessment'
  },
  'git-ops': {
    name: 'Repo Navigator',
    icon: GitBranch,
    color: 'text-purple-600', 
    bgColor: 'bg-purple-50',
    description: 'Git operations and repository management'
  }
} as const;

// Tool-specific action messages
const getToolActionMessage = (toolName: string, toolArgs?: any): string => {
  const name = toolName.toLowerCase();
  
  if (name.includes('query_codebase')) {
    const query = toolArgs?.query;
    return query ? `Searching codebase for "${query}"` : 'Searching codebase';
  }
  
  if (name.includes('vm_read_file')) {
    const file = toolArgs?.filePath || toolArgs?.path;
    if (file) {
      const fileName = file.split('/').pop();
      return `Reading ${fileName}`;
    }
    return 'Reading file';
  }
  
  if (name.includes('exec_shell_vm')) {
    const command = toolArgs?.command;
    if (command) {
      const shortCmd = command.length > 30 ? `${command.substring(0, 30)}...` : command;
      return `Running: ${shortCmd}`;
    }
    return 'Executing command';
  }
  
  if (name.includes('vulnerability')) return 'Running security scan';
  if (name.includes('clone_repo')) return 'Cloning repository';
  if (name.includes('vm_write_file')) return 'Writing file';
  if (name.includes('git_')) return 'Git operation in progress';
  
  return `Running ${toolName.replace(/_/g, ' ')}`;
};

// Animated dots component
const AnimatedDots = () => {
  return (
    <div className="flex space-x-1">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="w-2 h-2 bg-current rounded-full animate-pulse"
          style={{
            animationDelay: `${i * 0.2}s`,
            animationDuration: '1.4s'
          }}
        />
      ))}
    </div>
  );
};

// Pulse effect for active state
const PulseRing = ({ className }: { className?: string }) => {
  return (
    <div className={cn("absolute inset-0 rounded-full animate-ping", className)} 
         style={{ animationDuration: '2s' }} />
  );
};

export function TypingIndicator({ 
  isVisible = false, 
  currentAgent,
  currentAction,
  toolsExecuting = [],
  className 
}: TypingIndicatorProps) {
  const [currentToolIndex, setCurrentToolIndex] = React.useState(0);

  // Cycle through executing tools for display
  React.useEffect(() => {
    if (toolsExecuting.length <= 1) return;
    
    const interval = setInterval(() => {
      setCurrentToolIndex((prev) => (prev + 1) % toolsExecuting.length);
    }, 3000); // Change tool display every 3 seconds

    return () => clearInterval(interval);
  }, [toolsExecuting.length]);

  if (!isVisible) return null;

  // Determine what to display
  const currentTool = toolsExecuting[currentToolIndex];
  const agent = currentAgent ? agentInfo[currentAgent as keyof typeof agentInfo] : null;
  
  // Generate display message
  let displayMessage = currentAction || 'Thinking...';
  let subMessage = '';
  
  if (currentTool) {
    displayMessage = getToolActionMessage(currentTool.name, {});
    if (toolsExecuting.length > 1) {
      subMessage = `${currentToolIndex + 1} of ${toolsExecuting.length} tools running`;
    }
  } else if (agent) {
    displayMessage = agent.description;
  }

  const AgentIcon = agent?.icon || Bot;

  return (
    <div className={cn("flex gap-3 justify-start mt-6", className)}>
      {/* Avatar with pulse effect */}
      <div className="relative">
        <Avatar className="w-8 h-8 mt-1">
          <AvatarFallback className={cn(
            "relative overflow-hidden",
            agent?.bgColor || "bg-primary/10",
            agent?.color || "text-primary"
          )}>
            <PulseRing className={cn(
              agent?.color || "text-primary",
              "opacity-20"
            )} />
            <AgentIcon className="w-4 h-4 relative z-10" />
          </AvatarFallback>
        </Avatar>
        
        {/* Active indicator dot */}
        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-background rounded-full animate-pulse" />
      </div>

      {/* Message bubble */}
      <div className="bg-muted/40 rounded-2xl rounded-tl-md px-4 py-3 max-w-md">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {agent && (
                <span className={cn(
                  "text-xs font-medium px-2 py-0.5 rounded-full",
                  agent.bgColor,
                  agent.color
                )}>
                  {agent.name}
                </span>
              )}
              {currentTool && (
                <Loader2 className="w-3 h-3 animate-spin text-blue-600" />
              )}
            </div>
            
            <p className="text-sm text-foreground font-medium mb-1">
              {displayMessage}
            </p>
            
            {subMessage && (
              <p className="text-xs text-muted-foreground">
                {subMessage}
              </p>
            )}
          </div>
          
          {/* Animated dots */}
          <div className="text-muted-foreground">
            <AnimatedDots />
          </div>
        </div>
        
        {/* Progress bar for multiple tools */}
        {toolsExecuting.length > 1 && (
          <div className="mt-2 pt-2 border-t border-border/30">
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-muted rounded-full h-1">
                <div 
                  className="bg-primary h-1 rounded-full transition-all duration-300 ease-out"
                  style={{ 
                    width: `${((currentToolIndex + 1) / toolsExecuting.length) * 100}%` 
                  }}
                />
              </div>
              <span className="text-xs text-muted-foreground font-mono">
                {currentToolIndex + 1}/{toolsExecuting.length}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
