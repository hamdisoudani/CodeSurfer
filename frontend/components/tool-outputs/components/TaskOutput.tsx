"use client";

import { memo } from "react";
import { Markdown } from "../../renderers/Markdown";
import { ArrowRight, Bot, Sparkles } from "lucide-react";

export const TaskOutput = memo(function TaskOutput({ args, result }: { args: unknown; result: unknown }) {
  let parsedArgs: any = null;
  try { parsedArgs = typeof args === 'string' ? JSON.parse(args) : args; } catch {}

  const subagent = parsedArgs?.subagent_type || parsedArgs?.subagent || parsedArgs?.name || "Subagent";
  const description = parsedArgs?.description || parsedArgs?.message || parsedArgs?.task || "";

  // Parse result - could be string or JSON
  let resultText = "";
  try {
    if (typeof result === "string") {
      // Try to parse as JSON first to see if it has a message field
      try {
        const parsed = JSON.parse(result);
        resultText = parsed.message || parsed.response || parsed.result || result;
      } catch {
        // Not JSON, use as-is
        resultText = result;
      }
    } else if (result && typeof result === "object") {
      resultText = (result as any).message || (result as any).response || (result as any).result || JSON.stringify(result, null, 2);
    }
  } catch {
    resultText = String(result || "");
  }

  return (
    <div className="space-y-3">
      {/* Label */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Delegation</span>
        <ArrowRight className="w-3 h-3" />
      </div>

      {/* Orchestrator's message (delegation) */}
      <div className="flex gap-3 items-start">
        <div className="flex-shrink-0 mt-1">
          <div className="w-6 h-6 rounded-md bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/50 dark:border-blue-800/30 rounded-lg rounded-tl-none p-3">
            <div className="text-[11px] font-medium text-blue-700 dark:text-blue-300 mb-1.5">
              Orchestrator → {subagent}
            </div>
            {description && (
              <div className="text-xs text-foreground/90 whitespace-pre-wrap break-words leading-relaxed">
                {description}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sub-agent's response */}
      {resultText && (
        <div className="flex gap-3 items-start">
          <div className="flex-shrink-0 mt-1">
            <div className="w-6 h-6 rounded-md bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <Bot className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-800/30 rounded-lg rounded-tl-none p-3">
              <div className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300 mb-2">
                {subagent}
              </div>
              <div className="text-xs prose prose-sm dark:prose-invert max-w-none
                prose-p:my-2 prose-p:leading-relaxed
                prose-headings:mt-3 prose-headings:mb-2
                prose-ul:my-2 prose-ol:my-2
                prose-li:my-0.5
                prose-code:text-[11px] prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded
                prose-pre:text-[11px] prose-pre:my-2
              ">
                <Markdown>{resultText}</Markdown>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

TaskOutput.displayName = "TaskOutput";


