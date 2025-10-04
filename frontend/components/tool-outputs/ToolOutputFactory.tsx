import { memo } from "react";
import { BaseToolOutputProps, ParsedToolData, ToolDetectionResult } from "./types";
import { useToolData, useToolDetection } from "./hooks/useToolData";
import { FileOutput } from "./components/FileOutput";
import { DirectoryOutput } from "./components/DirectoryOutput";
import { ShellOutput } from "./components/ShellOutput";
import { QueryCodebaseOutput } from "./components/QueryCodebaseOutput";
import { JsonOutput, DiffOutput } from "./components/JsonOutput";
import { TaskOutput } from "./components/TaskOutput";
import { TodoOutput } from "./components/TodoOutput";
import { CommandsOutput } from "./components/CommandsOutput";
import { MarkdownOutput } from "./components/MarkdownOutput";
import { AnsiOutput } from "./components/AnsiOutput";
import { TextOutput } from "./components/TextOutput";

interface ToolOutputContentProps {
  data: ParsedToolData;
  detection: ToolDetectionResult;
  result: unknown;
}

const ToolOutputContent = memo<ToolOutputContentProps>(({ data, detection, result }) => {
  const { kind } = data;
  const { isFileJson, isDirectoryJson, isShellCommand, isQueryCodebaseResult, isDiffJson } = detection;
  
  // Handle JSON types with specific tool outputs
  if (kind === "json") {
    if (isFileJson) {
      return <FileOutput data={data} />;
    }
    
    if (isDirectoryJson) {
      return <DirectoryOutput data={data} />;
    }
    
    if (isShellCommand) {
      return <ShellOutput data={data} />;
    }
    
    if (isQueryCodebaseResult) {
      return <QueryCodebaseOutput data={data} />;
    }
    
    // Diff-aware JSON rendering
    if (isDiffJson) {
      return <DiffOutput json={data.json} />;
    }
    // Generic JSON fallback
    return <JsonOutput data={data} />;
  }
  
  // Handle other content types
  if (kind === "markdown" && !isQueryCodebaseResult) {
    return <MarkdownOutput result={result} />;
  }
  
  if (kind === "ansi") {
    return <AnsiOutput result={result} />;
  }
  
  // Text fallback (includes embedded JSON detection)
  if (kind === "text" && !isQueryCodebaseResult) {
    return <TextOutput data={data} result={result} />;
  }
  
  // Ultimate fallback
  return <TextOutput data={data} result={result} />;
});

ToolOutputContent.displayName = "ToolOutputContent";

interface ToolOutputFactoryProps {
  toolProps: Pick<BaseToolOutputProps, 'name' | 'result' | 'args'>;
}

export const ToolOutputFactory = memo<ToolOutputFactoryProps>(({ toolProps }) => {
  const data = useToolData(toolProps);
  const detection = useToolDetection(toolProps);
  
  // Special rendering for task() delegations: show subagent and message
  if (toolProps.name === "task") {
    return (
      <TaskOutput args={toolProps.args} result={toolProps.result} />
    );
  }

  // Special rendering for todo tool ONLY (not findings_write/read)
  const lowerName = toolProps.name.toLowerCase();
  if (lowerName === 'todo' || lowerName === 'write_todos' || lowerName === 'read_todos') {
    return <TodoOutput result={toolProps.result} />;
  }

  // Special rendering for commands execution tools
  if (lowerName.includes('command') || lowerName.includes('exec') || lowerName === 'run_commands' || lowerName === 'execute_commands') {
    return <CommandsOutput result={toolProps.result} args={toolProps.args} toolName={toolProps.name} />;
  }

  // Special rendering for vm_write_file: show like read_file (code view with filename/icon)
  if (toolProps.name === "vm_write_file") {
    let args: any = {};
    try { args = typeof toolProps.args === 'string' ? JSON.parse(toolProps.args) : (toolProps.args || {}); } catch {}
    const content: string = String(args?.content || "");
    const rawPath: string = String(args?.filePath || args?.path || "");
    const cleanPath = (() => {
      try {
        return decodeURIComponent(rawPath).replace(/^\/home\/daytona\/repo\//, "").replace(/^\/home\/daytona\//, "");
      } catch { return rawPath.replace(/^\/home\/daytona\/repo\//, "").replace(/^\/home\/daytona\//, ""); }
    })();
    const fileName = cleanPath.split('/').pop();
    const ext = fileName && fileName.includes('.') ? (fileName.split('.').pop() || "") : "";
    const langMap: Record<string,string> = { ts:"ts", tsx:"tsx", js:"javascript", jsx:"jsx", json:"json", md:"markdown", mdx:"mdx", sh:"bash", bash:"bash", zsh:"bash", py:"python", go:"go", rs:"rust", java:"java", kt:"kotlin", cs:"csharp", php:"php", rb:"ruby", yml:"yaml", yaml:"yaml", toml:"toml", sql:"sql", css:"css", scss:"scss", html:"html", vue:"vue", svelte:"svelte" };
    const lang = langMap[ext] || undefined;
    const fileData: ParsedToolData = {
      json: { content, filePath: rawPath },
      kind: "json",
      cleanFilePath: cleanPath || undefined,
      fileName: fileName || undefined,
      ext: ext || undefined,
      lang,
      startLine: 1,
      rangeBadge: undefined,
    };

    // Optional status line from result
    let resultJson: any = null; try { resultJson = typeof toolProps.result === 'string' ? JSON.parse(toolProps.result) : toolProps.result; } catch {}

    return (
      <div className="space-y-3">
        {resultJson?.message && (
          <div className="text-[11px] text-muted-foreground">{resultJson.message}</div>
        )}
        <FileOutput data={fileData} />
      </div>
    );
  }

  // Parse result JSON for response meta display
  let resultJson: any = null;
  try {
    resultJson = typeof toolProps.result === 'string' ? JSON.parse(toolProps.result) : toolProps.result;
  } catch {}

  return (
    <div className="space-y-3">
      {resultJson && (typeof resultJson === 'object') && (resultJson.ok !== undefined || resultJson.exitCode !== undefined || resultJson.durationMs !== undefined || resultJson.message) && (
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          {typeof resultJson.ok !== 'undefined' && (<span className={resultJson.ok ? 'text-green-700' : 'text-red-700'}>ok: {String(resultJson.ok)}</span>)}
          {typeof resultJson.exitCode !== 'undefined' && (<span>exitCode: {resultJson.exitCode}</span>)}
          {typeof resultJson.durationMs !== 'undefined' && (<span>duration: {resultJson.durationMs}ms</span>)}
          {resultJson.message && (<span className="truncate">{resultJson.message}</span>)}
        </div>
      )}

      <ToolOutputContent 
        data={data} 
        detection={detection} 
        result={toolProps.result} 
      />
    </div>
  );
});

ToolOutputFactory.displayName = "ToolOutputFactory";

function safeJson(val: unknown): string {
  try {
    if (typeof val === 'string') {
      try { return JSON.stringify(JSON.parse(val), null, 2); } catch { return val; }
    }
    return JSON.stringify(val, null, 2);
  } catch { return String(val); }
}
