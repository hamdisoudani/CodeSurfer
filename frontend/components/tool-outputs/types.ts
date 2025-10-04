// Shared types for tool output components
export interface BaseToolOutputProps {
  name: string;
  status: "executing" | "completed" | "error";
  result?: unknown;
  args?: unknown;
  hideHeader?: boolean;
}

export interface ParsedToolData {
  json: any | null;
  kind: "json" | "markdown" | "ansi" | "text";
  cleanFilePath?: string;
  fileName?: string;
  ext?: string;
  lang?: string;
  startLine?: number;
  rangeBadge?: string;
}

export interface ToolDetectionResult {
  isFileJson: boolean;
  isDirectoryJson: boolean;
  isShellCommand: boolean;
  isQueryCodebaseResult: boolean;
  isDiffJson: boolean;
  directoryName?: string;
}
