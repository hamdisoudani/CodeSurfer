"use client";

import * as React from "react";
import { MessageSquare, ArrowDown, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface EmptyChatStateProps {
  threadRepo?: string;
  threadBranch?: string;
  className?: string;
}

export function EmptyChatState({ 
  threadRepo, 
  threadBranch, 
  className 
}: EmptyChatStateProps) {
  return (
    <div className={`flex items-center justify-center py-16 ${className || ''}`}>
      <div className="text-center max-w-md">
        <div className="relative mb-6">
          {/* Animated background */}
          <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 blur-2xl animate-pulse"></div>
          
          {/* Main icon */}
          <div className="relative w-16 h-16 mx-auto bg-gradient-to-br from-primary/20 to-primary/10 rounded-2xl flex items-center justify-center mb-4">
            <MessageSquare className="w-7 h-7 text-primary/70" />
          </div>
        </div>

        <h3 className="text-lg font-semibold text-foreground mb-2">
          Ready for Security Analysis
        </h3>
        
        <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
          {threadRepo ? (
            <>
              Start your conversation about{" "}
              <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">
                {threadRepo.split('/').pop()}
                {threadBranch ? `:${threadBranch}` : ''}
              </code>
            </>
          ) : (
            "This conversation is ready for your first message"
          )}
        </p>

        {/* Suggested prompts */}
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground/80 mb-3">Try asking:</p>
          <div className="flex flex-wrap gap-2 justify-center">
            <Badge variant="outline" className="text-xs py-1 px-2 cursor-default hover:bg-muted/50 transition-colors">
              "Find vulnerabilities"
            </Badge>
            <Badge variant="outline" className="text-xs py-1 px-2 cursor-default hover:bg-muted/50 transition-colors">
              "Audit dependencies"
            </Badge>
            <Badge variant="outline" className="text-xs py-1 px-2 cursor-default hover:bg-muted/50 transition-colors">
              "Review authentication"
            </Badge>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="mt-8 flex items-center justify-center text-xs text-muted-foreground/60">
          <ArrowDown className="w-3 h-3 mr-1 animate-bounce" />
          <span>Type your message below</span>
        </div>
      </div>
    </div>
  );
}
