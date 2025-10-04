"use client";

import { memo, useMemo } from "react";
import { CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { BaseToolOutputProps } from "./types";
import { useToolData, useToolDetection } from "./hooks/useToolData";
import { ToolOutputFactory } from "./ToolOutputFactory";

interface ToolHeaderProps {
  name: string;
  status: "executing" | "completed" | "error";
  args?: unknown;
  data: ReturnType<typeof useToolData>;
  detection: ReturnType<typeof useToolDetection>;
}

function getArg(args: unknown, keys: string[]): string | undefined {
  try {
    const obj = typeof args === "string" ? JSON.parse(args) : (args as any);
    if (obj && typeof obj === "object") {
      for (const k of keys) {
        if (obj[k] != null) return String(obj[k]);
      }
    }
  } catch {}
  return undefined;
}

const ToolHeader = memo<ToolHeaderProps>(({ name, status, args, data, detection }) => {
  const badges = useMemo(() => {
    const badges = [];
    
    // Query args
    const argQuery = getArg(args, ["query"]);
    const argLimit = getArg(args, ["limit"]);
    const argSimilarity = getArg(args, ["similarityThreshold", "similarity"]);
    
    // Basic status badge
    badges.push(
      <Badge 
        key="status" 
        variant={status === "completed" ? "secondary" : status === "error" ? "destructive" : "outline"}
      >
        {status}
      </Badge>
    );
    
    // Query-specific badges
    if (name.toLowerCase().includes('query') && argLimit) {
      badges.push(<Badge key="limit" variant="outline" className="text-xs">limit {argLimit}</Badge>);
    }
    if (name.toLowerCase().includes('query') && argSimilarity) {
      badges.push(<Badge key="similarity" variant="outline" className="text-xs">min sim {argSimilarity}</Badge>);
    }
    
    // Directory name
    if (detection.directoryName) {
      badges.push(<Badge key="directory" variant="outline" className="text-xs">{detection.directoryName}</Badge>);
    }
    
    // File path (only if not directory and path differs from filename)
    if (!detection.isDirectoryJson && data.cleanFilePath && data.cleanFilePath !== data.fileName) {
      badges.push(<Badge key="filepath" variant="outline" className="text-xs">{data.cleanFilePath}</Badge>);
    }
    
    // File name
    if (!detection.isDirectoryJson && data.fileName) {
      badges.push(<Badge key="filename" variant="outline">{data.fileName}</Badge>);
    }
    
    // File extension
    if (!detection.isDirectoryJson && data.ext) {
      badges.push(<Badge key="ext" variant="outline" className="uppercase">{data.ext}</Badge>);
    }
    
    // Line range
    if (!detection.isDirectoryJson && data.rangeBadge) {
      badges.push(<Badge key="range" variant="outline">lines {data.rangeBadge}</Badge>);
    }
    
    return badges;
  }, [name, status, args, data, detection]);
  
  const title = useMemo(() => {
    const argQuery = getArg(args, ["query"]);
    if (name.toLowerCase().includes('query') && argQuery) {
      return `Query: "${argQuery}"`;
    }
    return name;
  }, [name, args]);
  
  return (
    <CardHeader className="py-2">
      <div className="flex items-center gap-2 flex-wrap">
        <CardTitle className="text-sm">{title}</CardTitle>
        {badges}
      </div>
    </CardHeader>
  );
});

ToolHeader.displayName = "ToolHeader";

export const ToolOutputRefactored = memo<BaseToolOutputProps>(({ 
  name, 
  status, 
  result, 
  args, 
  hideHeader = false 
}) => {
  const data = useToolData({ name, result, args });
  const detection = useToolDetection({ name, result });
  
  return (
    <div className={`w-full max-w-full overflow-hidden ${hideHeader ? "" : "bg-background/60"}`}>
      {!hideHeader && (
        <>
          <ToolHeader 
            name={name} 
            status={status} 
            args={args} 
            data={data} 
            detection={detection} 
          />
          <Separator />
        </>
      )}
      
      <div className={`w-full max-w-full overflow-hidden ${hideHeader ? "space-y-2" : "py-2 px-6 space-y-2"}`}>
        <ToolOutputFactory toolProps={{ name, result, args }} />
      </div>
    </div>
  );
});

ToolOutputRefactored.displayName = "ToolOutputRefactored";
