import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  User, 
  Bot, 
  ChevronDown, 
  ChevronRight, 
  CheckCircle2, 
  Clock, 
  Terminal, 
  Code,
  AlertCircle,
  Copy as CopyIcon,
  FileText,
  Search,
  Shield,
  Database,
  Folder,
  Play,
  Loader2,
  Bug,
  Target,
  Zap
} from "lucide-react";
import { 
  VscFile,
  VscFileCode,
  VscJson,
  VscMarkdown,
  VscSymbolProperty,
  VscDatabase,
  VscBrowser,
  VscFileMedia,
  VscGear,
  VscTerminalBash,
  VscFilePdf,
  VscFileZip,
  VscFolder
} from "react-icons/vsc";
import { 
  SiTypescript,
  SiJavascript,
  SiReact,
  SiPython,
  SiGo,
  SiRust,
  SiPhp,
  SiRuby,
  SiCplusplus,
  SiSwift,
  SiKotlin,
  SiHtml5,
  SiCss3,
  SiSass,
  SiVuedotjs,
  SiSvelte
} from "react-icons/si";
import { Markdown } from "./renderers/Markdown";
import ToolOutput from "./ToolOutput";
import { ThinkingBlock, extractThinkingBlocks } from "./ThinkingBlock";
import { cn } from "@/lib/utils";

type Message = {
  role?: string;
  type?: string;
  content: any;
  tool_call_id?: string;
  additional_kwargs?: any;
  toolCallsWithResults?: Array<{
    id: string;
    name: string;
    args?: unknown;
    result?: unknown;
    status: "executing" | "completed" | "error";
  }>;
};

type ChatMessageProps = {
  message: Message;
  showAvatar?: boolean;
  isFirstInGroup?: boolean;
  isLastInGroup?: boolean;
};

function renderContent(content: any) {
  if (Array.isArray(content)) {
    return (
      <div className="space-y-2">
        {content.map((c: any, i: number) => (
          <div key={i} className="leading-relaxed whitespace-pre-wrap">
            {typeof c === "string" ? c : c.text ?? JSON.stringify(c, null, 2)}
          </div>
        ))}
      </div>
    );
  }
  
  if (typeof content === "string") {
    // Check if it's JSON first
    try {
      const parsed = JSON.parse(content);
      return (
        <pre className="text-sm bg-muted rounded-md p-3 overflow-x-auto font-mono">
          {JSON.stringify(parsed, null, 2)}
        </pre>
      );
    } catch {
      // Always render string content as Markdown for assistant messages
      return <Markdown className="prose prose-sm dark:prose-invert max-w-none">{content}</Markdown>;
    }
  }
  
  if (content && content.url && content.title) {
    return (
      <a href={content.url} target="_blank" rel="noreferrer" className="text-primary underline">
        {content.title}
      </a>
    );
  }
  
  return (
    <pre className="text-sm bg-muted rounded-md p-3 overflow-x-auto font-mono">
      {JSON.stringify(content, null, 2)}
    </pre>
  );
}

function safeJson(val: unknown): string {
  try {
    let data = val;
    if (typeof val === "string") {
      try {
        data = JSON.parse(val);
      } catch (e) {
        // Not a JSON string, return as is
        return val;
      }
    }

    if (data && typeof data === 'object') {
      if ('stdout' in data && (data as any).stdout) {
        return String((data as any).stdout);
      }
      if ('content' in data && typeof (data as any).content === 'string') {
        return (data as any).content;
      }
      return JSON.stringify(data, null, 2);
    }

    return String(val);
  } catch {
    return String(val);
  }
}

function isToolOutputOnly(content: any): boolean {
  try {
    if (typeof content === "string") {
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === "object") {
        const keys = Object.keys(parsed);
        const toolKeys = ['action', 'sandboxId', 'path', 'output', 'message', 'summary', 'hasContext', 'context', 'result', 'status'];
        const hasToolKeys = keys.some(k => toolKeys.includes(k.toLowerCase()));
        return hasToolKeys && keys.length <= toolKeys.length; // Rough heuristic: mostly tool-related keys
      }
    }
    return false;
  } catch {
    return false;
  }
}

function getSubagentInfo(subagentType: string) {
  const subagentMap: Record<string, { name: string; description: string; icon: any }> = {
    'vm-runner': {
      name: 'VM Manager',
      description: 'Setting up secure testing environment',
      icon: Terminal
    },
    'project-explorer': {
      name: 'Project Explorer',
      description: 'Analyzing repository structure and attack surface',
      icon: Search
    },
    'repository-analyzer': {
      name: 'Repository Analyzer', 
      description: 'Performing comprehensive security analysis',
      icon: Shield
    },
    'vulnerability-assessor': {
      name: 'Vulnerability Assessor',
      description: 'Discovering and verifying security vulnerabilities',
      icon: Bug
    },
    'penetration-tester': {
      name: 'Penetration Tester',
      description: 'Performing ethical penetration testing',
      icon: Target
    }
  };
  
  return subagentMap[subagentType] || {
    name: subagentType.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    description: `Running ${subagentType} task`,
    icon: Bot
  };
}

function FileIcon({ fileName, className }: { fileName: string; className?: string }) {
  const IconComponent = getFileIcon(fileName);
  const ext = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() : '';
  
  // Add color classes for specific file types to match their official colors
  const colorMap: Record<string, string> = {
    'ts': 'text-blue-600', // TypeScript blue
    'tsx': 'text-blue-500', // React TypeScript
    'js': 'text-yellow-500', // JavaScript yellow
    'jsx': 'text-blue-400', // React blue
    'py': 'text-yellow-600', // Python yellow
    'go': 'text-cyan-500', // Go cyan
    'rs': 'text-orange-600', // Rust orange
    'java': 'text-red-600', // Java red
    'php': 'text-purple-600', // PHP purple
    'rb': 'text-red-500', // Ruby red
    'swift': 'text-orange-500', // Swift orange
    'html': 'text-orange-600', // HTML orange
    'css': 'text-blue-500', // CSS blue
    'scss': 'text-pink-500', // Sass pink
    'vue': 'text-green-500', // Vue green
    'svelte': 'text-orange-500', // Svelte orange
  };
  
  const colorClass = colorMap[ext || ''] || 'text-muted-foreground';
  
  return <IconComponent className={`${className} ${colorClass}`} />;
}

function getFileIcon(fileName: string) {
  if (!fileName) return VscFile;
  const ext = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() : '';
  
  const iconMap: Record<string, any> = {
    // JavaScript/TypeScript with specific icons
    'ts': SiTypescript, 'tsx': SiReact, 
    'js': SiJavascript, 'jsx': SiReact,
    'mjs': SiJavascript, 'cjs': SiJavascript,
    
    // Other Programming Languages with specific icons
    'py': SiPython, 'go': SiGo, 'rs': SiRust, 'rust': SiRust,
    'java': VscFileCode, 'kt': SiKotlin, 'cs': VscFileCode, 
    'php': SiPhp, 'rb': SiRuby, 'cpp': SiCplusplus, 'c': SiCplusplus,
    'swift': SiSwift, 'dart': VscFileCode, 'scala': VscFileCode,
    
    // Data & Config
    'json': VscJson, 'jsonc': VscJson,
    'yml': VscSymbolProperty, 'yaml': VscSymbolProperty, 
    'toml': VscSymbolProperty, 'ini': VscSymbolProperty,
    'xml': VscSymbolProperty, 'plist': VscSymbolProperty,
    
    // Web Technologies
    'html': SiHtml5, 'htm': SiHtml5,
    'css': SiCss3, 'scss': SiSass, 'sass': SiSass, 'less': VscBrowser,
    'vue': SiVuedotjs, 'svelte': SiSvelte,
    
    // Documentation
    'md': VscMarkdown, 'mdx': VscMarkdown, 'markdown': VscMarkdown,
    'txt': VscFile, 'readme': VscMarkdown,
    
    // Database
    'sql': VscDatabase, 'db': VscDatabase, 'sqlite': VscDatabase,
    
    // Config files
    'env': VscGear, 'config': VscGear, 'conf': VscGear,
    'gitignore': VscGear, 'dockerignore': VscGear,
    'dockerfile': VscGear, 'makefile': VscGear,
    'package': VscJson, 'lock': VscGear,
    
    // Shell scripts
    'sh': VscTerminalBash, 'bash': VscTerminalBash, 'zsh': VscTerminalBash,
    'ps1': VscTerminalBash, 'bat': VscTerminalBash, 'cmd': VscTerminalBash,
    
    // Media
    'png': VscFileMedia, 'jpg': VscFileMedia, 'jpeg': VscFileMedia, 
    'gif': VscFileMedia, 'svg': VscFileMedia, 'webp': VscFileMedia,
    'ico': VscFileMedia, 'bmp': VscFileMedia,
    
    // Archives & Docs
    'pdf': VscFilePdf,
    'zip': VscFileZip, 'tar': VscFileZip, 'gz': VscFileZip, 
    'rar': VscFileZip, '7z': VscFileZip,
  };
  
  return iconMap[ext || ''] || VscFile;
}

function getToolIcon(toolName: string, toolArgs?: unknown) {
  // Special handling for task tool calls (subagents)
  if (toolName.toLowerCase() === 'task') {
    const subagentType = pickArg(toolArgs, ['subagent_type']);
    if (subagentType) {
      return getSubagentInfo(subagentType).icon;
    }
    return Zap;
  }
  
  const name = toolName.toLowerCase();
  if (name.includes('query')) return Search;
  if (name.includes('read') || name.includes('file')) return FileText;
  if (name.includes('search') || name.includes('scan')) return Search;
  if (name.includes('vulnerability') || name.includes('security')) return Shield;
  if (name.includes('vm') || name.includes('exec')) return Terminal;
  if (name.includes('ls') || name.includes('dir')) return Folder;
  if (name.includes('db') || name.includes('database')) return Database;
  return Code;
}

function getToolDisplayName(toolName: string, toolArgs?: unknown, status?: string) {
  // Special handling for query codebase tool
  if (toolName.toLowerCase().includes('query')) {
    const query = pickArg(toolArgs, ['query']);
    if (query) {
      const prefix = status === 'executing' ? 'Searching' : 'Searched';
      return `${prefix} "${query}"`;
    }
  }

  // Special handling for exec_shell_vm to show the command
  if (toolName.toLowerCase() === 'exec_shell_vm') {
    const command = pickArg(toolArgs, ['command', 'cmd']);
    if (command) {
      // Keep it concise for the title
      const shortCmd = command.length > 50 ? `${command.substring(0, 50)}...` : command;
      return `Command`;
    }
    return 'Command';
  }

  // Special handling for exec_shell_many to show multiple commands
  if (toolName.toLowerCase() === 'exec_shell_many') {
    try {
      const obj = typeof toolArgs === 'string' ? JSON.parse(toolArgs) : toolArgs;
      const cmds = Array.isArray(obj?.commands) ? obj.commands : [];
      if (cmds.length > 0) {
        return `Commands (${cmds.length})`;
      }
    } catch {}
    return 'Commands';
  }

  // Show path in title for file operation tools
  const fileOperationTools = ['vm_write_file', 'vm_replace_in_file', 'vm_replace_regex_in_file', 
                               'vm_apply_patch_hunk', 'vm_modify_with_diff', 'vm_mkdir_p'];
  if (fileOperationTools.includes(toolName.toLowerCase())) {
    const filePath = pickArg(toolArgs, ['filePath', 'path', 'filepath']);
    if (filePath) {
      try {
        const clean = decodeURIComponent(String(filePath)).replace(/^\/home\/daytona\/repo\//, '').replace(/^\/home\/daytona\//, '');
        const name = clean.split('/').pop() || clean;
        return name;
      } catch {
        const clean = String(filePath).replace(/^\/home\/daytona\/repo\//, '').replace(/^\/home\/daytona\//, '');
        const name = clean.split('/').pop() || clean;
        return name;
      }
    }
  }
  
  // Special handling for task tool calls (subagents)
  if (toolName.toLowerCase() === 'task') {
    const subagentType = pickArg(toolArgs, ['subagent_type']);
    if (subagentType) {
      return getSubagentInfo(subagentType).name;
    }
    return 'Task';
  }

  // Special handling for git operations to show branch names
  if (toolName.toLowerCase() === 'git_create_branch' || toolName.toLowerCase() === 'git_switch_branch') {
    const branchName = pickArg(toolArgs, ['branch', 'branchName', 'name']);
    if (branchName) {
      return branchName;
    }
  }

  if (toolName.toLowerCase() === 'git_commit') {
    const message = pickArg(toolArgs, ['message', 'commitMessage']);
    if (message) {
      const shortMsg = message.length > 50 ? `${message.substring(0, 50)}...` : message;
      return `Commit: "${shortMsg}"`;
    }
  }

  if (toolName.toLowerCase() === 'github_create_pr') {
    const title = pickArg(toolArgs, ['title', 'prTitle']);
    if (title) {
      const shortTitle = title.length > 50 ? `${title.substring(0, 50)}...` : title;
      return `PR: "${shortTitle}"`;
    }
  }
  
  const nameMap: Record<string, string> = {
    // VM Management
    'clone_repo_vm': 'Clone Repository',
    'create_resume_vm': 'Resume VM',
    'get_vm_status': 'VM Status',
    'cleanup_vm': 'Cleanup VM',
    'manage_vm': 'Manage VM',
    
    // File Operations
    'vm_read_file': 'Read',
    'vm_write_file': 'Write',
    'vm_ls': 'List Directory',
    'vm_read_regions': 'Read Regions',
    'vm_read_script_output': 'Script Output',
    'vm_mkdir_p': 'Create Directory',
    
    // File Editing
    'vm_replace_in_file': 'Replace In File',
    'vm_replace_regex_in_file': 'Regex Replace',
    'vm_apply_patch_hunk': 'Apply Patch Hunk',
    'vm_modify_with_diff': 'Modify With Diff',
    'vm_batch_edit': 'Batch Edit',
    'vm_rg_search': 'Search Code',
    
    // Shell Commands
    'exec_shell_vm': 'Command',
    'exec_shell_many': 'Commands',
    
    // Background Processes
    'list_background_processes': 'List Processes',
    'kill_background_process': 'Kill Process',
    'check_process_status': 'Process Status',
    
    // Git Operations
    'git_get_current_branch': 'Get Current Branch',
    'git_create_branch': 'Create Branch',
    'git_switch_branch': 'Switch Branch',
    'git_list_commits': 'List Commits',
    'git_commit': 'Commit Changes',
    'git_push_branch': 'Push Branch',
    'github_create_pr': 'Create Pull Request',
    
    // Findings & Knowledge
    'findings_write': 'Write Findings',
    'findings_read': 'Read Findings',
    'findings_list': 'List Findings',
    'findings_index': 'Index Findings',
    'findings_stat': 'Findings Stats',
    'findings_should_run': 'Check Findings',
    
    // Security & Analysis
    'vulnerability_scan': 'Vulnerability Scan',
    'analyze_repository': 'Analyze Repository',
    'query_codebase': 'Query Codebase',
    'get_context': 'Get Context',
    
    // Utilities
    'inspect_daytona': 'Inspect Daytona',
    'ls': 'List Files',
  };
  return nameMap[toolName] || toolName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function pickArg(args: any, keys: string[]): string | undefined {
  try {
    const obj = typeof args === 'string' ? JSON.parse(args) : args;
    if (obj && typeof obj === 'object') {
      for (const k of keys) {
        if (obj[k] != null) return String(obj[k]);
      }
    }
  } catch {}
  return undefined;
}

function getToolDescription(toolName: string, status: string, args?: unknown): string {
  const name = toolName.toLowerCase();
  
  // Special handling for subagent task calls
  if (name === 'task') {
    const subagentType = pickArg(args, ['subagent_type']);
    const description = pickArg(args, ['description']);
    
    if (subagentType) {
      const subagentInfo = getSubagentInfo(subagentType);
      const tense = (ing: string, past: string, fail: string) => {
        if (status === 'executing') return ing;
        if (status === 'completed') return past;
        if (status === 'error') return fail;
        return ing;
      };
      
      const taskDesc = description ? `: ${description}` : '';
      return tense(
        `${subagentInfo.description}${taskDesc}`,
        `Task completed by ${subagentInfo.name}`,
        `Task failed: ${subagentInfo.name}`
      );
    }
  }
  
  const file = pickArg(args, ['filePath', 'path', 'filepath']);
  const dir = pickArg(args, ['path', 'dir', 'directory']);
  const cmd = pickArg(args, ['command', 'cmd']);
  const repo = pickArg(args, ['repo', 'repository', 'repoUrl', 'url', 'target']);
  const task = pickArg(args, ['task', 'name']);
  const scanType = pickArg(args, ['scanType', 'type']);

  const tense = (ing: string, past: string, fail: string) => {
    if (status === 'executing') return ing;
    if (status === 'completed') return past;
    if (status === 'error') return fail;
    return ing;
  };

  if (name.includes('vm_read_file') && file) return tense(`Reading file ${file}`, `Read file ${file}`, `Failed reading file ${file}`);
  if (name.includes('vm_ls') && (dir || file)) return tense(`Listing ${dir || file}`, `Listed ${dir || file}`, `Failed listing ${dir || file}`);
  if (name.includes('exec_shell_vm') && cmd) return tense(`Running command "${cmd}"`, `Ran command "${cmd}"`, `Failed running command "${cmd}"`);
  if (name.includes('clone_repo_vm') && repo) return tense(`Cloning repository ${repo}`, `Cloned repository ${repo}`, `Failed cloning repository ${repo}`);
  if (name.includes('create_resume_vm')) return tense(`Starting VM`, `Started VM`, `Failed starting VM`);
  if (name.includes('get_vm_status')) return tense(`Checking VM status`, `Checked VM status`, `Failed checking VM status`);
  if (name.includes('cleanup_vm')) return tense(`Cleaning up VM`, `Cleaned up VM`, `Failed cleaning up VM`);
  if (name.includes('findings_write') && task) return tense(`Saving findings "${task}"`, `Saved findings "${task}"`, `Failed saving findings "${task}"`);
  if (name.includes('findings_read') && task) return tense(`Reading findings "${task}"`, `Read findings "${task}"`, `Failed reading findings "${task}"`);
  if (name.includes('vulnerability_scan')) return tense(`Running ${scanType ? `${scanType} ` : ''}vulnerability scan`, `${scanType ? `${scanType} ` : ''}vulnerability scan complete`, `Vulnerability scan failed`);
  if (name.includes('get_context')) return tense(`Retrieving context`, `Retrieved context`, `Failed retrieving context`);

  const display = getToolDisplayName(toolName, args, status);
  // For command executions, the title is already descriptive enough.
  if (name.includes('exec_shell_vm')) {
    const cmd = pickArg(args, ['command', 'cmd']);
    return tense(`Running command "${cmd}"`, `Ran command "${cmd}"`, `Failed running command "${cmd}"`);
  }

  return tense(`Running ${display}`, `${display} completed`, `Failed: ${display}`);
}

function formatSize(bytes: number): string {
  if (!isFinite(bytes) || bytes < 0) return `${bytes}`;
  if (bytes < 1024) return `${bytes} bytes`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
}

// Custom scrollable output component
function ScrollableOutput({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-h-64 overflow-y-auto rounded-lg border border-border/50 bg-muted/20">
      <div className="p-3">
        {children}
      </div>
    </div>
  );
}

function InlineTool({ toolCall }: { toolCall: any }) {
  const [isOpen, setIsOpen] = React.useState(false);
  const isExecuting = toolCall.status === "executing";
  const isTaskTool = toolCall.name.toLowerCase() === 'task';
  
  // For task delegation tool, show a simple loader while executing
  if (isTaskTool && isExecuting) {
    const subagentType = pickArg(toolCall.args, ['subagent_type']);
    const subagentInfo = subagentType ? getSubagentInfo(subagentType) : { name: 'Task', icon: Zap };
    const SubagentIcon = subagentInfo.icon;
    const description = pickArg(toolCall.args, ['description', 'task', 'message']);
    
    return (
      <div className="border-l-2 border-blue-300 dark:border-blue-700/50 bg-gradient-to-r from-blue-50/40 to-transparent dark:from-blue-950/20 dark:to-transparent rounded-r-lg px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0">
            <div className="w-5 h-5 rounded-md bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
              <SubagentIcon className="w-3 h-3 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                {subagentInfo.name}
              </span>
              <Loader2 className="w-3 h-3 text-blue-500 animate-spin" />
            </div>
            {description && (
              <p className="text-xs text-muted-foreground/70 line-clamp-2">
                {description}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }
  
  // Extract file info for better UI
  const filePath = pickArg(toolCall.args, ['filePath', 'path', 'filepath']);
  
  // Clean and decode the path with error handling
  const cleanPath = filePath ? (() => {
    try {
      return decodeURIComponent(String(filePath))
        .replace(/^\/home\/daytona\/repo\//, "")
        .replace(/^\/home\/daytona\//, "");
    } catch {
      return String(filePath)
        .replace(/^\/home\/daytona\/repo\//, "")
        .replace(/^\/home\/daytona\//, "");
    }
  })() : undefined;
  
  const fileName = cleanPath ? cleanPath.split("/").pop() : undefined;
  
  // Check tool type
  const lowerName = toolCall.name.toLowerCase();
  const isDirectoryTool = lowerName.includes('list') || lowerName.includes('ls');
  const isFileWrite = lowerName === 'vm_write_file' || lowerName.includes('vm_write_file');
  const isFileEdit = lowerName.includes('vm_replace') || lowerName.includes('vm_modify') || 
                      lowerName.includes('vm_apply_patch') || lowerName === 'vm_batch_edit';
  const isCommandTool = lowerName === 'exec_shell_vm' || lowerName === 'exec_shell_many';
  const startLine = pickArg(toolCall.args, ['startLine', 'start']);
  const endLine = pickArg(toolCall.args, ['endLine', 'end']);
  const maxLines = pickArg(toolCall.args, ['maxLines']);
  
  // Build smart title
  let smartTitle = getToolDisplayName(toolCall.name, toolCall.args, toolCall.status);
  let lineInfo = "";
  
  if (startLine && endLine) {
    lineInfo = ` (lines ${startLine}–${endLine})`;
  } else if (startLine && maxLines) {
    const end = parseInt(startLine) + parseInt(maxLines) - 1;
    lineInfo = ` (lines ${startLine}–${end})`;
  } else if (startLine) {
    lineInfo = ` (from line ${startLine})`;
  }
  
  const isFileRead = (lowerName.includes('read') || isFileWrite || isFileEdit) && fileName;
  const isDirectoryList = isDirectoryTool && cleanPath;
  
  // Command tool handling - keep full command for expanded view
  let fullCommand: string | undefined;
  let commandSnippet: string | undefined;
  let commandCount = 0;
  let commandLines: string[] = [];
  if (isCommandTool) {
    if (lowerName === 'exec_shell_vm') {
      fullCommand = pickArg(toolCall.args, ['command', 'cmd']);
      if (fullCommand) {
        commandSnippet = fullCommand.length > 80 ? `${fullCommand.slice(0, 80)}...` : fullCommand;
        commandCount = 1;
        try {
          commandLines = fullCommand.split(/\s*&&\s*|\s*;\s*/).filter(Boolean);
        } catch { commandLines = [fullCommand]; }
      }
    } else {
      try {
        const obj = typeof toolCall.args === 'string' ? JSON.parse(toolCall.args) : toolCall.args;
        const cmds = Array.isArray(obj?.commands) ? obj.commands as string[] : [];
        commandCount = cmds.length;
        fullCommand = cmds.join('\n');
        commandLines = cmds;
        if (cmds.length > 0) {
          const first = cmds[0];
          commandSnippet = first.length > 80 ? `${first.slice(0, 80)}...` : first;
          if (cmds.length > 1) commandSnippet += '  …';
        }
      } catch {}
    }
  }
  
  // Status config
  const statusConfig = {
    executing: {
      dot: "bg-blue-500",
      text: "Running",
      border: "border-blue-300/50",
      icon: <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin" />,
      badge: "bg-blue-50 text-blue-700 border-blue-200"
    },
    completed: {
      dot: "bg-emerald-500",
      text: "Completed",
      border: "border-emerald-300/50",
      icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />,
      badge: "bg-emerald-50 text-emerald-700 border-emerald-200"
    },
    error: {
      dot: "bg-red-500",
      text: "Failed",
      border: "border-red-300/50",
      icon: <AlertCircle className="w-3.5 h-3.5 text-red-600" />,
      badge: "bg-red-50 text-red-700 border-red-200"
    }
  };

  const config = statusConfig[toolCall.status as keyof typeof statusConfig] || statusConfig.executing;

  // Parse result for meta
  let resultJson: any = null;
  try { resultJson = typeof toolCall.result === 'string' ? JSON.parse(toolCall.result) : toolCall.result; } catch {}
  const bytes = isFileWrite ? (resultJson?.bytesWritten as number | undefined) : undefined;

  // Action label
  let actionLabel: string | undefined;
  if (lowerName.includes('vm_read_file')) actionLabel = 'Read';
  else if (isFileWrite) actionLabel = resultJson?.append ? 'Appended' : 'Created';

  return (
    <div className={cn(
      "group relative border-l-2 rounded-r-lg transition-all duration-200",
      config.border,
      isExecuting ? "bg-gradient-to-r from-blue-50/40 to-transparent dark:from-blue-950/20 dark:to-transparent hover:from-blue-50/60 dark:hover:from-blue-950/30" :
      toolCall.status === "completed" ? "bg-gradient-to-r from-emerald-50/40 to-transparent dark:from-emerald-950/20 dark:to-transparent hover:from-emerald-50/60 dark:hover:from-emerald-950/30" :
      "bg-gradient-to-r from-red-50/40 to-transparent dark:from-red-950/20 dark:to-transparent hover:from-red-50/60 dark:hover:from-red-950/30"
    )}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full text-left px-4 py-2.5 flex items-start gap-3 group/btn"
      >
        {/* Icon */}
        <div className="flex-shrink-0 mt-0.5">
          <div className={cn(
            "w-5 h-5 rounded-md flex items-center justify-center transition-colors",
            isExecuting ? "bg-blue-100 dark:bg-blue-900/40 group-hover/btn:bg-blue-200 dark:group-hover/btn:bg-blue-800/50" :
            toolCall.status === "completed" ? "bg-emerald-100 dark:bg-emerald-900/40 group-hover/btn:bg-emerald-200 dark:group-hover/btn:bg-emerald-800/50" :
            "bg-red-100 dark:bg-red-900/40 group-hover/btn:bg-red-200 dark:group-hover/btn:bg-red-800/50"
          )}>
            {isFileRead && fileName ? (
              <FileIcon fileName={fileName} className="w-3 h-3" />
            ) : isDirectoryList ? (
              <VscFolder className="w-3 h-3 text-blue-500" />
            ) : (
              React.createElement(getToolIcon(toolCall.name, toolCall.args), { 
                className: cn(
                  "w-3 h-3",
                  isExecuting ? "text-blue-600 dark:text-blue-400" :
                  toolCall.status === "completed" ? "text-emerald-600 dark:text-emerald-400" :
                  "text-red-600 dark:text-red-400"
                )
              })
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {/* Tool icon and title for files/directories */}
            {isFileRead && fileName ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-xs font-medium text-foreground truncate flex items-center gap-2">
                      {actionLabel && (
                        <Badge variant="outline" className="text-[10px] py-0 px-1.5">{actionLabel}</Badge>
                      )}
                      <span>{fileName}{lineInfo}</span>
                      {typeof bytes === 'number' && (
                        <span className="text-xs text-muted-foreground">({formatSize(bytes)})</span>
                      )}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">{cleanPath}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : isDirectoryList ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-xs font-medium text-foreground truncate">
                      {cleanPath?.split('/').pop() || cleanPath || 'Directory'}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">{cleanPath}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : isCommandTool && (commandSnippet || commandLines.length) ? (
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                    {commandCount > 1 ? `Commands (${commandCount})` : 'Command'}
                  </Badge>
                  {fullCommand && (
                    <div
                      role="button"
                      tabIndex={0}
                      className="text-muted-foreground hover:text-foreground cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); try { navigator.clipboard.writeText(fullCommand!); } catch {} }}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); try { navigator.clipboard.writeText(fullCommand!); } catch {} } }}
                      title="Copy command(s)"
                    >
                      <CopyIcon className="w-3 h-3" />
                    </div>
                  )}
                </div>
                {!isOpen && (
                  <pre className="mt-1 font-mono text-[10px] whitespace-pre-wrap break-words leading-4 text-muted-foreground/70">
                    {commandLines.length && commandLines.length <= 2
                      ? commandLines.map((ln, i) => (
                          <div key={i}><span className="text-muted-foreground/50">$ </span>{ln}</div>
                        ))
                      : <div><span className="text-muted-foreground/50">$ </span>{commandSnippet}</div>
                    }
                  </pre>
                )}
              </div>
            ) : (
              <span className="text-xs font-medium text-foreground">
                {smartTitle}{lineInfo}
              </span>
            )}
            
            {/* Status indicator */}
            <span className={cn(
              "text-[10px] flex items-center gap-1 ml-auto",
              isExecuting ? "text-blue-500/60 dark:text-blue-400/60" :
              toolCall.status === "completed" ? "text-emerald-500/60 dark:text-emerald-400/60" :
              "text-red-500/60 dark:text-red-400/60"
            )}>
              <span className={cn("w-1 h-1 rounded-full", config.dot)} />
              {config.text}
            </span>
          </div>
          
          {/* Show path for files when collapsed */}
          {!isOpen && isFileRead && cleanPath && cleanPath !== fileName && (
            <p className="text-[10px] text-muted-foreground/60 line-clamp-1">
              {cleanPath}
            </p>
          )}
          {!isOpen && isDirectoryList && cleanPath && cleanPath.includes('/') && (
            <p className="text-[10px] text-muted-foreground/60 line-clamp-1">
              {cleanPath}
            </p>
          )}
        </div>

        {/* Expand indicator */}
        <div className="flex-shrink-0 mt-1">
          <ChevronDown 
            className={cn(
              "w-3.5 h-3.5 transition-transform duration-200",
              isExecuting ? "text-blue-400 dark:text-blue-500" :
              toolCall.status === "completed" ? "text-emerald-400 dark:text-emerald-500" :
              "text-red-400 dark:text-red-500",
              isOpen && "rotate-180"
            )}
          />
        </div>
      </button>

      {/* Expanded content */}
      {isOpen && (
        <div className="px-4 pb-3 pt-0 pl-12">
          {toolCall.result !== undefined && (
            <div className="w-full max-w-full overflow-hidden">
              <ToolOutput name={toolCall.name} status={toolCall.status} result={toolCall.result} args={toolCall.args} hideHeader={true} />
            </div>
          )}
          
          {isExecuting && !toolCall.result && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground p-2">
              <Loader2 className="w-3 h-3 animate-spin text-blue-600" />
              <span>Executing...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const ChatMessageInner = ({ message, showAvatar = true, isFirstInGroup = true, isLastInGroup = true }: ChatMessageProps) => {
  const isUser = message.role === "user" || message.type === "human";
  const isAI = message.role === "assistant" || message.type === "ai";
  const isTool = message.role === "tool" || message.type === "tool";
  
  if (isTool) return null;
  
  // Extract thinking blocks from AI messages
  const { thinking, cleanContent } = React.useMemo(() => {
    if (isAI && typeof message.content === 'string') {
      return extractThinkingBlocks(message.content);
    }
    return { thinking: [], cleanContent: message.content };
  }, [isAI, message.content]);
  
  const hasThinking = thinking.length > 0;
  const hasCleanContent = cleanContent && String(cleanContent).trim() && !isToolOutputOnly(cleanContent);
  
  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"} ${!isFirstInGroup ? "mt-1" : "mt-6"}`}>
      {!isUser && showAvatar && (
        <Avatar className="w-8 h-8 mt-1">
          <AvatarFallback className="bg-primary text-primary-foreground">
            {isAI ? <Bot className="w-4 h-4" /> : <Terminal className="w-4 h-4" />}
          </AvatarFallback>
        </Avatar>
      )}
      
      {!isUser && !showAvatar && (
        <div className="w-8 h-8 mt-1 flex justify-center">
          {!isLastInGroup && (
            <div className="w-0.5 h-full bg-border/50 rounded-full mt-2" />
          )}
        </div>
      )}
      
      <div className={`w-full max-w-4xl ${isUser ? "order-first ml-auto" : ""}`}>
        <div className={`text-sm transition-all duration-200 ${
          isUser 
            ? "bg-primary text-primary-foreground ml-4 px-4 py-3 rounded-2xl" 
            : "bg-transparent px-0 py-0"
        } ${
          isUser 
            ? isFirstInGroup && isLastInGroup 
              ? "rounded-2xl"
              : isFirstInGroup 
                ? "rounded-2xl rounded-br-md"
                : isLastInGroup
                  ? "rounded-2xl rounded-tr-md" 
                  : "rounded-r-md rounded-l-2xl"
            : isFirstInGroup && isLastInGroup
              ? ""
              : isFirstInGroup
                ? ""
                : isLastInGroup
                  ? ""
                  : ""
        }`}>
          {/* Thinking blocks - render first for AI messages */}
          {hasThinking && (
            <div className="mb-3 space-y-2">
              {thinking.map((thinkContent, idx) => (
                <ThinkingBlock key={idx} content={thinkContent} isCompleted={true} />
              ))}
            </div>
          )}

          {/* Content - only show if it's not just tool output */}
          {hasCleanContent && (
            <div className={message.toolCallsWithResults?.length ? "mb-2" : ""}>
              {renderContent(cleanContent)}
            </div>
          )}

          {/* Tool executions inline */}
          {message.toolCallsWithResults && message.toolCallsWithResults.length > 0 && (
            <div className="mt-3 space-y-2">
              {message.toolCallsWithResults.map((toolCall) => (
                <InlineTool key={toolCall.id} toolCall={toolCall} />
              ))}
            </div>
          )}
        </div>
      </div>
      
      {isUser && showAvatar && (
        <Avatar className="w-8 h-8 mt-1 ml-2">
          <AvatarFallback className="bg-primary/10 text-primary border border-primary/20">
            <User className="w-4 h-4" />
          </AvatarFallback>
        </Avatar>
      )}
      
      {isUser && !showAvatar && (
        <div className="w-8 h-8 mt-1 ml-2 flex justify-center">
          {!isLastInGroup && (
            <div className="w-0.5 h-full bg-primary/20 rounded-full mt-2" />
          )}
        </div>
      )}
    </div>
  );
};

// Memoize message rendering to reduce churn during streaming
export const ChatMessage = React.memo(ChatMessageInner, (prev, next) => {
  // Re-render only if identity or visible fields actually change
  const a = prev.message as any;
  const b = next.message as any;
  if (a === b) return true;
  if (a.role !== b.role || a.type !== b.type) return false;
  if (a.content !== b.content) return false;
  const aTools = a.toolCallsWithResults?.map((t: any) => `${t.id}:${t.status}`).join('|') || '';
  const bTools = b.toolCallsWithResults?.map((t: any) => `${t.id}:${t.status}`).join('|') || '';
  if (aTools !== bTools) return false;
  return prev.showAvatar === next.showAvatar && prev.isFirstInGroup === next.isFirstInGroup && prev.isLastInGroup === next.isLastInGroup;
});

