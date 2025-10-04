"use client";

import { memo } from "react";
import { Terminal, CheckCircle2, XCircle, Clock, AlertCircle } from "lucide-react";
import { CodeBlock } from "../../renderers/CodeBlock";
import { cn } from "@/lib/utils";

interface CommandResult {
  command: string;
  ok: boolean;
  exitCode: number;
  durationMs?: number;
  stdout?: string;
  stderr?: string;
}

interface CommandsOutputProps {
  result: unknown;
  args?: unknown;
  toolName?: string;
}

export const CommandsOutput = memo<CommandsOutputProps>(({ result, args, toolName }) => {
  // Parse the result to extract command results
  let commands: CommandResult[] = [];
  let overallOk = true;
  let isSingleCommand = false;
  
  try {
    let parsed = typeof result === 'string' ? JSON.parse(result) : result;
    
    console.log('CommandsOutput parsing result:', parsed);
    
    // Handle various formats
    if (parsed && typeof parsed === 'object') {
      // exec_shell_many format: { ok, results: [...], totalDurationMs }
      if (Array.isArray(parsed.results)) {
        commands = parsed.results;
        overallOk = parsed.ok !== false;
        isSingleCommand = false;
      }
      // Direct array of results
      else if (Array.isArray(parsed)) {
        commands = parsed;
        isSingleCommand = false;
      }
      // exec_shell_vm format: single command result { ok, exitCode, stdout, stderr, durationMs }
      else if (parsed.ok !== undefined || parsed.exitCode !== undefined || parsed.stdout !== undefined) {
        // This is a single command result from exec_shell_vm
        // Extract command from args since it's not in the result
        let commandText = "Unknown command";
        try {
          const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
          if (parsedArgs && typeof parsedArgs === 'object') {
            commandText = (parsedArgs as any).command || (parsedArgs as any).cmd || "Unknown command";
          }
        } catch {}
        
        const singleCmd: CommandResult = {
          command: commandText,
          ok: parsed.ok !== false,
          exitCode: parsed.exitCode ?? 0,
          durationMs: parsed.durationMs,
          stdout: parsed.stdout,
          stderr: parsed.stderr
        };
        commands = [singleCmd];
        overallOk = parsed.ok !== false;
        isSingleCommand = true;
      }
    }
  } catch (e) {
    console.error('Failed to parse commands:', e);
  }

  if (!commands.length) {
    return (
      <div className="text-xs text-muted-foreground p-3 text-center border border-border/40 rounded-md bg-muted/20">
        No commands to display
      </div>
    );
  }

  // Determine if this is exec_shell_many based on tool name or command count
  const isMany = toolName?.includes('many') || (!isSingleCommand && commands.length > 1);

  return (
    <div className="space-y-3">
      {commands.map((cmd, index) => {
        const hasStdout = cmd.stdout && cmd.stdout.trim().length > 0;
        const hasStderr = cmd.stderr && cmd.stderr.trim().length > 0;
        const hasOutput = hasStdout || hasStderr;

        return (
          <div
            key={index}
            className={cn(
              "rounded-lg border overflow-hidden",
              cmd.ok 
                ? "border-emerald-200/50 dark:border-emerald-800/30 bg-emerald-50/30 dark:bg-emerald-950/20"
                : "border-red-200/50 dark:border-red-800/30 bg-red-50/30 dark:bg-red-950/20"
            )}
          >
            {/* Command Header */}
            <div className="px-3 py-2 flex items-center gap-3 border-b border-border/40">
              <div className="flex-shrink-0">
                <div className={cn(
                  "w-5 h-5 rounded flex items-center justify-center",
                  cmd.ok 
                    ? "bg-emerald-100 dark:bg-emerald-900/40"
                    : "bg-red-100 dark:bg-red-900/40"
                )}>
                  <Terminal className={cn(
                    "w-3 h-3",
                    cmd.ok 
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400"
                  )} />
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <code className="text-[11px] font-mono text-foreground/90">
                  $ {cmd.command}
                </code>
              </div>

              <div className="flex items-center gap-3 flex-shrink-0">
                {/* Duration */}
                {cmd.durationMs !== undefined && (
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    <span>{cmd.durationMs}ms</span>
                  </div>
                )}

                {/* Exit Code */}
                <div className={cn(
                  "flex items-center gap-1 text-[10px] font-medium",
                  cmd.exitCode === 0 
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400"
                )}>
                  {cmd.ok ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5" />
                  )}
                  <span>Exit {cmd.exitCode}</span>
                </div>
              </div>
            </div>

            {/* Output */}
            {hasOutput && (
              <div className="p-3 space-y-2">
                {/* stdout */}
                {hasStdout && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <Terminal className="w-3 h-3" />
                      <span className="font-medium">Output</span>
                    </div>
                    <CodeBlock 
                      code={cmd.stdout!} 
                      language="bash" 
                      maxHeight="300px"
                    />
                  </div>
                )}

                {/* stderr */}
                {hasStderr && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[10px] text-red-600 dark:text-red-400">
                      <AlertCircle className="w-3 h-3" />
                      <span className="font-medium">Error Output</span>
                    </div>
                    <CodeBlock 
                      code={cmd.stderr!} 
                      language="bash" 
                      maxHeight="300px"
                    />
                  </div>
                )}
              </div>
            )}

            {/* No output message */}
            {!hasOutput && (
              <div className="px-3 py-2 text-[11px] text-muted-foreground/60 italic">
                No output
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});

CommandsOutput.displayName = "CommandsOutput";

