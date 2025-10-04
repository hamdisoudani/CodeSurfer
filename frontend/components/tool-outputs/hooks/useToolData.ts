import { useMemo } from "react";
import { ParsedToolData, ToolDetectionResult, BaseToolOutputProps } from "../types";

function parseMaybeJson(value: unknown): any | null {
  if (value == null) return null;
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return null; }
  }
  return null;
}

function detectKind(name: string, result: unknown): "json" | "markdown" | "ansi" | "text" {
  const json = parseMaybeJson(result);
  if (json) return "json";

  if (typeof result === "string") {
    const s = result.trim();
    if (s.startsWith("# ") || s.includes("```") || s.startsWith("#")) return "markdown";
    if (s.includes("\u001b[")) return "ansi";
  }
  return "text";
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

function extToLang(ext: string): string {
  const map: Record<string, string> = {
    ts: "ts", tsx: "tsx", js: "javascript", jsx: "jsx", json: "json",
    md: "markdown", mdx: "mdx", sh: "bash", bash: "bash", zsh: "bash",
    py: "python", go: "go", rs: "rust", java: "java", kt: "kotlin",
    cs: "csharp", php: "php", rb: "ruby", yml: "yaml", yaml: "yaml",
    toml: "toml", sql: "sql", css: "css", scss: "scss", html: "html",
    vue: "vue", svelte: "svelte",
  };
  return map[ext] || "";
}

export function useToolData({ name, result, args }: Pick<BaseToolOutputProps, 'name' | 'result' | 'args'>): ParsedToolData {
  return useMemo(() => {
    const json = parseMaybeJson(result);
    const kind = detectKind(name, result);
    
    // File path extraction and cleaning
    const argFilePath = getArg(args, ["filePath", "path", "filepath"]);
    const rawFilePath = (json && typeof json === "object" && json?.filePath) || 
      (json && typeof json === "object" && json?.path) || argFilePath;
    
    const cleanFilePath = rawFilePath ? (() => {
      try {
        return decodeURIComponent(String(rawFilePath))
          .replace(/^\/home\/daytona\/repo\//, "")
          .replace(/^\/home\/daytona\//, "");
      } catch {
        return String(rawFilePath)
          .replace(/^\/home\/daytona\/repo\//, "")
          .replace(/^\/home\/daytona\//, "");
      }
    })() : undefined;
    
    const fileName = cleanFilePath ? cleanFilePath.split("/").pop() : undefined;
    const ext = fileName && fileName.includes(".") ? (fileName.split(".").pop() || "") : "";
    const lang = extToLang(ext);
    
    // Line range extraction
    const argStart = getArg(args, ["startLine", "start"]);
    const argEnd = getArg(args, ["endLine", "end"]);
    const argMaxLines = getArg(args, ["maxLines"]);
    
    let rangeBadge: string | undefined = undefined;
    let startLine = 1;
    
    if (argStart && argEnd) {
      startLine = parseInt(argStart, 10);
      rangeBadge = `${argStart}–${argEnd}`;
    } else if (argStart && argMaxLines) {
      startLine = parseInt(argStart, 10);
      const endLine = startLine + parseInt(argMaxLines, 10) - 1;
      rangeBadge = `${argStart}–${endLine}`;
    } else if (argStart) {
      startLine = parseInt(argStart, 10);
      rangeBadge = `from ${argStart}`;
    } else if (json && typeof json === "object" && typeof json.description === "string") {
      const m = String(json.description).match(/lines?\s*(\d+)\s*-\s*(\d+)/i);
      if (m) {
        startLine = parseInt(m[1], 10);
        rangeBadge = `${m[1]}–${m[2]}`;
      }
    }
    
    return {
      json,
      kind,
      cleanFilePath,
      fileName,
      ext,
      lang,
      startLine,
      rangeBadge,
    };
  }, [name, result, args]);
}

export function useToolDetection({ name, result }: Pick<BaseToolOutputProps, 'name' | 'result'>): ToolDetectionResult {
  return useMemo(() => {
    const json = parseMaybeJson(result);
    
    const isFileJson = json && typeof json === "object" && typeof json?.content === "string";
    
    const isDirectoryJson = json && typeof json === "object" && 
      (typeof json?.stdout === "string" || Array.isArray(json?.files)) &&
      (name.toLowerCase().includes('list') || name.toLowerCase().includes('ls'));
    
    const isShellCommand = (name === 'exec_shell_vm' || name === 'exec_shell_many') && json && 
      typeof json === 'object' && typeof json?.stdout === 'string';
    
    const isQueryCodebaseResult = name === 'query_codebase' && json && 
      typeof json === "object" && Array.isArray(json.results) && json.results.length > 0 &&
      json.results[0] && typeof json.results[0].filePath === "string";

    const isDiffJson = json && typeof json === 'object' && (
      Array.isArray(json.parsedHunks) || Array.isArray(json.results) && json.results.some((r: any) => r && Array.isArray(r.parsedHunks))
    );
    
    const directoryName = isDirectoryJson ? (
      (() => {
        try {
          const path = json?.path ? decodeURIComponent(String(json.path)) : undefined;
          return path?.replace(/^\/home\/daytona\/repo\//, "").replace(/^\/home\/daytona\//, "") || "Directory";
        } catch {
          return json?.path || "Directory";
        }
      })()
    ) : undefined;
    
    return {
      isFileJson,
      isDirectoryJson,
      isShellCommand,
      isQueryCodebaseResult,
      isDiffJson,
      directoryName,
    };
  }, [name, result]);
}
