"use client";

import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bot, User } from "lucide-react";

interface MessageSkeletonProps {
  isUser?: boolean;
  showAvatar?: boolean;
  hasToolCalls?: boolean;
}

function MessageSkeletonItem({ isUser = false, showAvatar = true, hasToolCalls = false }: MessageSkeletonProps) {
  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"} mt-6`}>
      {!isUser && showAvatar && (
        <Avatar className="w-8 h-8 mt-1">
          <AvatarFallback className="bg-primary/10 animate-pulse">
            <Bot className="w-4 h-4 text-primary/50" />
          </AvatarFallback>
        </Avatar>
      )}
      
      {!isUser && !showAvatar && (
        <div className="w-8 h-8 mt-1" />
      )}
      
      <div className={`w-full max-w-4xl ${isUser ? "order-first ml-auto" : ""}`}>
        <div className={`${
          isUser 
            ? "bg-primary/10 ml-4 px-4 py-3 rounded-2xl animate-pulse" 
            : "bg-transparent px-0 py-0"
        }`}>
          {/* Message content skeleton */}
          <div className="space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            {Math.random() > 0.5 && <Skeleton className="h-4 w-2/3" />}
          </div>
          
          {/* Tool calls skeleton */}
          {hasToolCalls && !isUser && (
            <div className="mt-3 space-y-2">
              {Array.from({ length: Math.floor(Math.random() * 3) + 1 }).map((_, i) => (
                <div key={i} className="border rounded-lg p-3 bg-muted/20 animate-pulse">
                  <div className="flex items-center gap-2 mb-2">
                    <Skeleton className="w-6 h-6 rounded" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                  <Skeleton className="h-16 w-full rounded" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      
      {isUser && showAvatar && (
        <Avatar className="w-8 h-8 mt-1 ml-2">
          <AvatarFallback className="bg-primary/10 border border-primary/20 animate-pulse">
            <User className="w-4 h-4 text-primary/50" />
          </AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}

export function MessageSkeleton() {
  return (
    <div className="space-y-1">
      {/* User message */}
      <MessageSkeletonItem isUser={true} showAvatar={true} />
      
      {/* AI response with tool calls */}
      <MessageSkeletonItem isUser={false} showAvatar={true} hasToolCalls={true} />
      
      {/* Continued AI message */}
      <MessageSkeletonItem isUser={false} showAvatar={false} />
      
      {/* Another user message */}
      <MessageSkeletonItem isUser={true} showAvatar={false} />
      
      {/* AI response */}
      <MessageSkeletonItem isUser={false} showAvatar={false} hasToolCalls={Math.random() > 0.7} />
    </div>
  );
}
