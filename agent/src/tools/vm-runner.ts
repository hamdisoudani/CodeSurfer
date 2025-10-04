import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { Daytona } from "@daytonaio/sdk";
import { getCurrentTaskInput, type LangGraphRunnableConfig } from "@langchain/langgraph";
import { resolveContext } from "../lib/context-helpers";
import { getInstallationAccessToken } from "../lib/github";
import { type PentestAgentStateType } from "../state";

const HOME = "/home/daytona";

// Helper to parse unified diffs into UI-friendly hunks
function parseUnifiedDiff(diff: string): { hunks: Array<{ header: string; oldStart: number; oldLines: number; newStart: number; newLines: number; lines: string[] }>; totals: { added: number; removed: number } } {
  const hunks: Array<{ header: string; oldStart: number; oldLines: number; newStart: number; newLines: number; lines: string[] }> = [];
  let added = 0;
  let removed = 0;
  const lines = diff.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('@@')) {
      const header = line;
      const match = /@@\s-([0-9]+)(?:,([0-9]+))?\s\+([0-9]+)(?:,([0-9]+))?\s@@/.exec(header);
      const oldStart = match ? Number(match[1]) : 0;
      const oldLines = match && match[2] ? Number(match[2]) : 0;
      const newStart = match ? Number(match[3]) : 0;
      const newLines = match && match[4] ? Number(match[4]) : 0;
      const hunkLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('@@')) {
        const ln = lines[i];
        if (ln.startsWith('+')) added++;
        else if (ln.startsWith('-')) removed++;
        hunkLines.push(ln);
        i++;
      }
      hunks.push({ header, oldStart, oldLines, newStart, newLines, lines: hunkLines });
      continue;
    }
    i++;
  }
  return { hunks, totals: { added, removed } };
}

export const cloneRepoVMTool = tool(
  async (
    { folder, sandboxId }: { folder?: string; sandboxId?: string },
    config: LangGraphRunnableConfig
  ) => {
    // Access the current graph state using getCurrentTaskInput()
    const state = getCurrentTaskInput() as PentestAgentStateType;
    const ctx = resolveContext(state);
    
    // Config is available for runtime values (thread_id, toolCall.id, etc.)
    const threadId = config.configurable?.thread_id;
    const vm = state?.vm_session;
    
    // 🔥 MODE-AWARE: Read mode from state (set by get_context via post-model hook)
    const mode = state?.context?.mode || ctx.mode || (ctx.targetRepo ? 'repo' : 'scratch');
    if (mode === 'scratch' || !ctx?.targetRepo) {
      const projectDir = '/home/daytona/project';
      return {
        action: 'scratch_mode_initialized',
        mode: 'scratch',
        workingDirectory: projectDir,
        message: `🎨 SCRATCH MODE: No repository to clone. Working directory set to ${projectDir}. Create your project files here. When ready to publish, user will provide target repository.`,
        instructions: [
          `All project files should be created in ${projectDir}/`,
          'Build the complete project based on user requirements',
          'Run tests and quality checks before asking for target repo',
          'When ready, ask user: "Please provide the GitHub repository (e.g., username/repo-name) where you\'d like to push this code"'
        ]
      };
    }
    
    if (!ctx?.targetRepo) return { error: "No repository context. Please select a repository." };

    const daytona = new Daytona({
      apiKey: process.env.DAYTONA_API_KEY,
      apiUrl: process.env.DAYTONA_API_URL || "https://app.daytona.io/api",
      target: (process.env.DAYTONA_TARGET as any) || "us",
    });

    // Resolve sandbox: prefer state, then arg, then labels
    let targetSandboxId: string | undefined = vm?.sandboxId || sandboxId;
    let sandbox: any = undefined;
    if (targetSandboxId) {
      try { sandbox = await daytona.get(targetSandboxId); } catch {}
    }
    if (!sandbox) {
      try {
        const labels = buildSandboxLabels(ctx, vm);
        sandbox = await daytona.findOne({ labels });
        if (sandbox) targetSandboxId = sandbox.id;
      } catch {}
    }
    if (!sandbox) return { error: "No active VM. Create/resume first or provide sandboxId." };
    // Ensure sandbox is started
    const infoState = String((sandbox as any).state || "").toLowerCase();
    if (infoState && infoState !== "started") {
      await sandbox.start(120);
    }

    const useBranch = ctx.selectedBranch || "main";
    const repoName = String(ctx.targetRepo).split("/")[1] || "repo";
    let targetDir: string;
    if (folder && typeof folder === "string") {
      const trimmed = folder.trim();
      if (trimmed && !trimmed.includes("..") && !trimmed.includes("/") && !trimmed.includes("\\")) {
        targetDir = `${HOME}/${trimmed}`;
      } else if (trimmed) {
        return { error: "Invalid folder name. Use a simple name without slashes or .." };
      } else {
        targetDir = `${HOME}/${repoName}`;
      }
    } else {
      targetDir = `${HOME}/${repoName}`;
    }

     // Check if repository already exists
    //  try {
    //   const checkCmd = `ls -la "${targetDir}/.git" 2>/dev/null && echo "EXISTS" || echo "NOT_EXISTS"`;
    //   const checkRes = await sandbox.process.executeCommand(checkCmd, HOME, undefined, 10);
    //   const alreadyExists = (checkRes?.artifacts?.stdout || "").includes("EXISTS");
      
    //   if (alreadyExists) {
    //     return { action: "repo_cloned", sandboxId: targetSandboxId, workingDirectory: targetDir, message: `Repository ${ctx.targetRepo}:${useBranch} already exists at ${targetDir}` };
    //   }
    // } catch {
    //   // Ignore check errors, proceed with clone
    // }

    // Determine token: use context token or mint via installationId
    //let token = (ctx as any).accessToken as string | undefined;
    let token;
    if (ctx.installationId) {
      token = await getInstallationAccessToken(ctx.installationId);
    }
   
    const url = `https://github.com/${ctx.targetRepo}`;
    const username = token ? "token" : undefined;
    const password = token ? token : undefined;
    
   
    
    await sandbox.git.clone(url, targetDir, useBranch, undefined, username, password);
    return { action: "repo_cloned", sandboxId: targetSandboxId, workingDirectory: targetDir, message: `Cloned ${ctx.targetRepo}:${useBranch} into ${targetDir}` };
  },
  {
    name: "clone_repo_vm",
    description: `Clone target repo into /home/daytona/<folder>. If folder omitted, defaults to repo name.

IMPORTANT: This tool detects operating mode:
- SCRATCH MODE: If no repository is configured, returns scratch mode instructions (no clone performed)
- REPO MODE: Clones the configured repository from GitHub

In scratch mode, working directory is set to /home/daytona/project/ for building new projects.`,
    schema: z.object({
      folder: z.string().optional().describe("Optional folder name under /home/daytona"),
      sandboxId: z.string().optional().describe("Optional sandbox ID to use if state is missing"),
    }),
  }
);

// New: Execute multiple shell commands in sequence with a single tool call
export const execShellManyVMTool = tool(
  async (
    { commands, cwd, env, timeout, stopOnFailure, maxOutputChars, combinedOutput }: { commands: string[]; cwd?: string; env?: Record<string,string>; timeout?: number; stopOnFailure?: boolean; maxOutputChars?: number; combinedOutput?: boolean },
    config: LangGraphRunnableConfig
  ) => {
    const state = getCurrentTaskInput() as PentestAgentStateType;
    const ctx = resolveContext(state);
    const vm = state?.vm_session;
    const daytona = new Daytona({
      apiKey: process.env.DAYTONA_API_KEY,
      apiUrl: process.env.DAYTONA_API_URL || "https://app.daytona.io/api",
      target: (process.env.DAYTONA_TARGET as any) || "us",
    });
    const opTimeout = typeof timeout === 'number' && timeout > 0 ? timeout : 120;
    const limit = maxOutputChars || 4000;
    // Resolve sandbox
    let targetSandboxId: string | undefined = vm?.sandboxId;
    let sandbox: any = undefined;
    if (targetSandboxId) { try { sandbox = await daytona.get(targetSandboxId); } catch {} }
    if (!sandbox) {
      try {
        const labels = buildSandboxLabels(ctx, vm);
        sandbox = await daytona.findOne({ labels });
        if (sandbox) targetSandboxId = sandbox.id;
      } catch {}
    }
    if (!sandbox) return { error: 'No active VM. Create/resume first.' };

    const results: any[] = [];
    const startedAt = Date.now();
    for (const command of commands) {
      const cmdStart = Date.now();
      const res = await sandbox.process.executeCommand(command, cwd || vm?.workingDirectory || HOME, env, opTimeout);
      const exitCode = (res as any)?.exitCode ?? 0;
      let stdout = res?.artifacts?.stdout || '';
      let stderr = res?.artifacts?.stderr || '';
      if (stdout.length > limit) stdout = stdout.substring(0, limit) + '\n... [stdout trimmed]';
      if (stderr.length > limit) stderr = stderr.substring(0, limit) + '\n... [stderr trimmed]';
      const output = combinedOutput ? [stdout, stderr].filter(Boolean).join('\n') : stdout;
      results.push({ command, ok: exitCode === 0, exitCode, durationMs: Date.now() - cmdStart, stdout: output, stderr: combinedOutput ? undefined : stderr });
      if (stopOnFailure && exitCode !== 0) break;
    }

    const ok = results.every(r => r.ok);
    return { action: 'commands_executed', ok, sandboxId: targetSandboxId, results, totalDurationMs: Date.now() - startedAt };
  },
  {
    name: 'exec_shell_many',
    description: `Execute multiple shell commands sequentially with unified, LLM-friendly result objects. Supports stopOnFailure and combinedOutput.`,
    schema: z.object({
      commands: z.array(z.string()).min(1).describe('Commands to execute in order'),
      cwd: z.string().optional(),
      env: z.record(z.string()).optional(),
      timeout: z.number().int().positive().optional().describe('Per-command timeout in seconds (default 120)'),
      stopOnFailure: z.boolean().optional().describe('Stop executing further commands if one fails'),
      maxOutputChars: z.number().int().positive().optional().describe('Max characters per stream to return (default 4000)'),
      combinedOutput: z.boolean().optional().describe('Merge stdout/stderr into stdout for simpler parsing')
    })
  }
);

export const execShellVMTool = tool(
  async (
    { command, cwd, env, timeout, background, sandboxId, maxOutputChars, combinedOutput }: { command: string; cwd?: string; env?: Record<string, string>; timeout?: number; background?: boolean; sandboxId?: string; maxOutputChars?: number; combinedOutput?: boolean },
    config: LangGraphRunnableConfig
  ) => {
    // Access the current graph state using getCurrentTaskInput()
    const state = getCurrentTaskInput() as PentestAgentStateType;
    const ctx = resolveContext(state);
    
    // Config is available for runtime values (thread_id, toolCall.id, etc.)
    const threadId = config.configurable?.thread_id;
    const vm = state?.vm_session;
    if (!command) return { error: "No command provided" };
    const daytona = new Daytona({
      apiKey: process.env.DAYTONA_API_KEY,
      apiUrl: process.env.DAYTONA_API_URL || "https://app.daytona.io/api",
      target: (process.env.DAYTONA_TARGET as any) || "us",
    });
    const opTimeout = typeof timeout === "number" && timeout > 0 ? timeout : 120;
    const maxChars = maxOutputChars || 4000; // Default limit to prevent huge outputs

    // Resolve sandbox: prefer state, then arg, then labels
    let targetSandboxId: string | undefined = vm?.sandboxId || sandboxId;
    let sandbox: any = undefined;
    if (targetSandboxId) {
      try { sandbox = await daytona.get(targetSandboxId); } catch {}
    }
    if (!sandbox) {
      try {
        const labels = buildSandboxLabels(ctx, vm);
        sandbox = await daytona.findOne({ labels });
        if (sandbox) targetSandboxId = sandbox.id;
      } catch {}
    }
    if (!sandbox) return { error: "No active VM. Create/resume first or provide sandboxId." };

    const resolvedCwd = cwd || vm?.workingDirectory || HOME;
    
    // Detect if this is a script execution that should have output saved
    const isScriptExecution = command.startsWith('/home/daytona/scripts/') && command.includes('.sh');
    let outputFile: string | undefined;
    let actualCommand = command;
    
    if (isScriptExecution && !background) {
      // Extract script path and create output file path
      const scriptMatch = command.match(/\/home\/daytona\/scripts\/([^\/\s]+\.sh)/);
      if (scriptMatch) {
        const scriptName = scriptMatch[1];
        outputFile = `/home/daytona/scripts/${scriptName.replace('.sh', '.output')}`;
        // Modify command to save output to file
        actualCommand = `${command} > "${outputFile}" 2>&1`;
      }
    }
    
    if (background) {
      const bgCmd = `nohup ${actualCommand} > ${HOME}/.vmrunner_bg.log 2>&1 & echo $!`;
      const res = await sandbox.process.executeCommand(bgCmd, resolvedCwd, env, 10);
      const pid = res?.artifacts?.stdout?.trim();
      const ok = !!pid;
      return { action: "command_started", ok, sandboxId: targetSandboxId, pid, command, cwd: resolvedCwd, logFile: `${HOME}/.vmrunner_bg.log` };
    } else {
      const startedAt = Date.now();
      const res = await sandbox.process.executeCommand(actualCommand, resolvedCwd, env, opTimeout);
      const durationMs = Date.now() - startedAt;
      const exitCode = (res as any)?.exitCode ?? 0;
      let stdout = res?.artifacts?.stdout || '';
      let stderr = res?.artifacts?.stderr || '';
      
      // If we saved output to a file, read it back for better formatting
      if (outputFile) {
        try {
          const outputRes = await sandbox.process.executeCommand(`cat "${outputFile}"`, resolvedCwd, undefined, 30);
          stdout = outputRes?.artifacts?.stdout || stdout;
        } catch {
          // If reading saved output fails, use original stdout
        }
      }
      
      // Apply output trimming if needed
      const isTrimmed = stdout.length > maxChars;
      if (isTrimmed) {
        stdout = stdout.substring(0, maxChars) + '\n... [output trimmed - see full output in saved file]';
      }
      const isErrTrimmed = stderr.length > maxChars;
      if (isErrTrimmed) {
        stderr = stderr.substring(0, maxChars) + '\n... [stderr trimmed]';
      }

      const output = combinedOutput ? [stdout, stderr].filter(Boolean).join('\n') : stdout;
      const ok = exitCode === 0;
      
      return { 
        action: "command_executed", 
        ok,
        sandboxId: targetSandboxId, 
        stdout: output,
        stderr: combinedOutput ? undefined : stderr,
        exitCode,
        durationMs,
        outputSavedTo: outputFile,
        outputTrimmed: isTrimmed,
        fullOutputSize: res?.artifacts?.stdout?.length || 0,
        message: outputFile ? `Command executed. Full output saved to ${outputFile}${isTrimmed ? ' (display trimmed)' : ''}` : undefined
      };
    }
  },
  {
    name: "exec_shell_vm",
    description: `Execute shell command with advanced output management and automatic script output persistence.
    
    PROFESSIONAL OUTPUT MANAGEMENT:
    - Scripts in /home/daytona/scripts/ automatically save full output to .output files
    - Example: project_scan.sh → project_scan.output (overwritten on each run)
    - Tool returns trimmed output but mentions where full output is saved
    - Other agents can review previous script execution results
    
    WHEN TO USE:
    - Execute bash scripts created with vm_write_file
    - Run complex commands that combine multiple operations
    - Execute vulnerability scanning, project analysis, or penetration testing scripts
    - Any shell operation that benefits from preserved output history
    
    AUTO-SAVE BEHAVIOR:
    - Commands like "/home/daytona/scripts/project_scan.sh" automatically become:
      "/home/daytona/scripts/project_scan.sh > /home/daytona/scripts/project_scan.output 2>&1"
    - Full output preserved in .output file, trimmed output returned in tool response
    - Enables script output sharing between agents and sessions
    
    PARAMETERS:
    - command (required): Shell command to execute
    - maxOutputChars (optional): Max characters to return (default 4000, full output still saved)
    - cwd, env, timeout, background, sandboxId: Standard execution options
    - combinedOutput (optional): When true, merges stdout and stderr into stdout
    
    RETURNS:
    - ok: Boolean indicating exit success (exitCode === 0)
    - stdout: Command output (trimmed if large)
    - stderr: Error output (if combinedOutput is false)
    - exitCode: Process exit code
    - durationMs: Execution time in milliseconds
    - outputSavedTo: Path to saved output file (for scripts)
    - outputTrimmed: Boolean indicating if output was truncated
    - fullOutputSize: Original output size in characters
    - message: Summary including save location`,
    schema: z.object({
      command: z.string(),
      cwd: z.string().optional(),
      env: z.record(z.string()).optional(),
      timeout: z.number().int().positive().optional().describe("Timeout in seconds (default 120)"),
      background: z.boolean().optional().describe("Run command in background with nohup &"),
      sandboxId: z.string().optional().describe("Optional sandbox ID to use if state is missing"),
      maxOutputChars: z.number().int().positive().optional().describe("Maximum characters to return (default 4000, full output still saved to .output file)"),
      combinedOutput: z.boolean().optional().describe("Merge stdout and stderr into stdout")
    }),
  }
);

// Helper: build consistent Daytona labels for sandbox discovery/deduplication
function buildSandboxLabels(context: any, vmSession?: any, state?: any): Record<string, string> {
  // Read mode from state first (most reliable after get_context is called)
  const mode = state?.context?.mode || context?.mode || (context?.targetRepo ? 'repo' : 'scratch');
  const labels: Record<string, string> = {
    type: "pentesting",
    mode: mode, // 🔥 Add mode label to distinguish scratch vs repo VMs
  };
  if (context?.githubUsername) labels.user = String(context.githubUsername);
  if (context?.targetRepo) labels.repo = String(context.targetRepo);
  if (vmSession?.sessionId) labels.sessionId = String(vmSession.sessionId);
  return labels;
}

export const createResumeVMTool = tool(
  async ({ timeout }: { timeout?: number }, config: LangGraphRunnableConfig) => {
    // Access the current graph state using getCurrentTaskInput()
    const state = getCurrentTaskInput() as PentestAgentStateType;
    const context = resolveContext(state);
    const vmSession = state?.vm_session;
    
    // Config is available for runtime values (thread_id, toolCall.id, etc.)
    const threadId = config.configurable?.thread_id;

    // 🔥 MODE-AWARE: Read mode from state (set by get_context via post-model hook)
    const mode = state?.context?.mode || context.mode || (context.targetRepo ? 'repo' : 'scratch');
    const isScratchMode = mode === 'scratch';
    
    if (!context && !isScratchMode) {
      return { error: 'No context available. Please configure your environment first.' };
    }

    const daytona = new Daytona({
      apiKey: process.env.DAYTONA_API_KEY,
      apiUrl: process.env.DAYTONA_API_URL || 'https://app.daytona.io/api',
      target: (process.env.DAYTONA_TARGET as any) || 'us',
    });

    const opTimeout = typeof timeout === 'number' && isFinite(timeout) && timeout > 0 ? timeout : 120;
    const labels = buildSandboxLabels(context, vmSession);

    try {
      // 1) Try by saved sandboxId first (most precise)
      if (vmSession?.sandboxId) {
        try {
          const existing = await daytona.get(vmSession.sandboxId);
          // const computerUse = await existing.computerUse.start();
          // console.log(computerUse);
          const info = {
            id: existing.id,
            state: (existing as any).state || 'unknown',
            labels: (existing as any).labels || {}
          };
          if (info.state !== 'started') {
            await existing.start(opTimeout);
          }
          // After any create/resume, ensure essential tools are installed
          try {
            await existing.process.executeCommand("apt-get update && apt-get install -y ripgrep", undefined, undefined, 180);
          } catch (e) {
            console.error("Failed to install ripgrep, proceeding without it.", e);
          }
          return {
            action: 'vm_resumed',
            sandboxId: existing.id,
            message: `Using existing VM ${existing.id} (${info.state}) from saved session id.`,
            status: 'active',
            labels,
            repoCloned: vmSession?.repoCloned || false,
          };
        } catch (error) {
          // Sandbox might be deleted, continue to fallback
        }
      }

      // 2) Fallback to label-based deduplication
      let sandbox = undefined as any;
      try {
        sandbox = await daytona.findOne({ labels });
      } catch (error) {
        // No existing sandbox found
      }

      if (sandbox) {
        const info = {
          id: sandbox.id,
          state: (sandbox as any).state || 'unknown',
          labels: (sandbox as any).labels || {}
        };
        if (info.state !== 'started') {
          await sandbox.start(opTimeout);
          // const computerUse = sandbox.computerUse.start();
          // console.log(computerUse);
        }
        // After any create/resume, ensure essential tools are installed
        try {
          await sandbox.process.executeCommand("apt-get update && apt-get install -y ripgrep", undefined, undefined, 180);
        } catch (e) {
          console.error("Failed to install ripgrep, proceeding without it.", e);
        }
        return {
          action: 'vm_resumed',
          sandboxId: sandbox.id,
          message: `Using existing VM ${sandbox.id} (${info.state}) found by labels.`,
          status: 'active',
          labels,
          repoCloned: vmSession?.repoCloned || false,
        };
      }

      // 3) Create new sandbox
      sandbox = await daytona.create({
        //image: 'ubuntu:latest',
        envVars: {
          GITHUB_USER: context.githubUsername || 'unknown',
          TARGET_REPO: context.targetRepo || ''
        },
        labels,
        autoStopInterval: 180
      }, { timeout: opTimeout });

      // After any create/resume, ensure essential tools are installed
      try {
        await sandbox.process.executeCommand("apt-get update && apt-get install -y ripgrep", undefined, undefined, 180);
      } catch (e) {
        console.error("Failed to install ripgrep, proceeding without it.", e);
      }

      return {
        action: 'vm_created',
        sandboxId: sandbox.id,
        message: `Created secure VM environment ${sandbox.id} for ${context.targetRepo}`,
        status: 'active',
        labels,
        repoCloned: false
      };
    } catch (error) {
      return { action: 'error', message: `VM operation failed: ${(error as Error).message}` };
    }
  },
  {
    name: "create_resume_vm",
    description: `Create or resume a VM environment for the current repository context.
    
    WHEN TO USE:
    - At the start of any VM-based workflow to ensure you have an active environment
    - When you need a secure, isolated environment for repository analysis
    - Before cloning repositories or executing commands
    
    BEHAVIOR:
    - First tries to resume existing VM using saved sandboxId from state
    - Falls back to finding VM by labels (user, repo, type)
    - Creates new VM if none exists
    - Automatically starts stopped VMs
    
    RETURNS:
    - action: 'vm_created' | 'vm_resumed' | 'error'
    - sandboxId: VM identifier for subsequent operations
    - status: VM status ('active', etc.)
    - repoCloned: boolean indicating if repo is already cloned`,
    schema: z.object({
      timeout: z.number().int().positive().optional().describe("Timeout in seconds for VM operations (default 120)")
    })
  }
);

export const getVMStatusTool = tool(
  async ({ sandboxId }: { sandboxId?: string }, config: LangGraphRunnableConfig) => {
    // Access the current graph state using getCurrentTaskInput()
    const state = getCurrentTaskInput() as PentestAgentStateType;
    const context = resolveContext(state);
    const vmSession = state?.vm_session;
    
    // Config is available for runtime values (thread_id, toolCall.id, etc.)
    const threadId = config.configurable?.thread_id;

    // 🔥 MODE-AWARE: Read mode from state (set by get_context via post-model hook)
    const mode = state?.context?.mode || context.mode || (context.targetRepo ? 'repo' : 'scratch');
    const isScratchMode = mode === 'scratch';
    
    if (!context && !isScratchMode) {
      return { error: 'No context available. Please configure your environment first.' };
    }

    const daytona = new Daytona({
      apiKey: process.env.DAYTONA_API_KEY,
      apiUrl: process.env.DAYTONA_API_URL || 'https://app.daytona.io/api',
      target: (process.env.DAYTONA_TARGET as any) || 'us',
    });

    try {
      const labels = buildSandboxLabels(context, vmSession);
      
      // Priority: explicit sandboxId > saved sandboxId > label search
      const targetId = sandboxId || vmSession?.sandboxId;
      let sandbox = undefined as any;

      if (targetId) {
        try {
          sandbox = await daytona.get(targetId);
        } catch (error) {
          // Sandbox might be deleted, try label fallback
        }
      }

      if (!sandbox) {
        try {
          sandbox = await daytona.findOne({ labels });
        } catch (error) {
          // No sandbox found
        }
      }

      if (!sandbox) {
        return { 
          action: 'status', 
          status: 'none', 
          message: 'No sandbox found for current context', 
          labels 
        };
      }

      // TypeScript SDK: access properties directly from sandbox
      const info = { 
        id: sandbox.id, 
        state: (sandbox as any).state || 'unknown',
        labels: (sandbox as any).labels || {},
        updatedAt: (sandbox as any).updatedAt || new Date().toISOString()
      };

      return { 
        action: 'status', 
        sandboxId: sandbox.id, 
        info,
        status: info.state,
        message: `VM ${sandbox.id} is ${info.state}`
      };
    } catch (error) {
      return { action: 'error', message: `Failed to get VM status: ${(error as Error).message}` };
    }
  },
  {
    name: "get_vm_status",
    description: `Get the current status of VM environment.
    
    WHEN TO USE:
    - To check if a VM is running, stopped, or terminated
    - Before performing operations that require an active VM
    - For debugging VM-related issues
    - To verify VM state after operations
    
    BEHAVIOR:
    - First tries to find VM using provided sandboxId
    - Falls back to saved sandboxId from state
    - Falls back to label-based search if no ID available
    - Returns detailed VM information including state and labels
    
    RETURNS:
    - action: 'status' | 'error'
    - sandboxId: VM identifier if found
    - status: VM state ('started', 'stopped', 'terminated', 'none')
    - info: Detailed VM information (id, state, labels, updatedAt)`,
    schema: z.object({
      sandboxId: z.string().optional().describe("Optional specific sandbox ID to check")
    })
  }
);

export const cleanupVMTool = tool(
  async ({ force }: { force?: boolean }, config: LangGraphRunnableConfig) => {
    // Access the current graph state using getCurrentTaskInput()
    const state = getCurrentTaskInput() as PentestAgentStateType;
    const vmSession = state?.vm_session;
    
    // Config is available for runtime values (thread_id, toolCall.id, etc.)
    const threadId = config.configurable?.thread_id;
    
    if (!vmSession?.sandboxId) {
      return { error: 'No active VM to clean up.' };
    }

    const daytona = new Daytona({
      apiKey: process.env.DAYTONA_API_KEY,
      apiUrl: process.env.DAYTONA_API_URL || 'https://app.daytona.io/api',
      target: (process.env.DAYTONA_TARGET as any) || 'us',
    });

    try {
      const sandbox = await daytona.get(vmSession.sandboxId);
      await daytona.delete(sandbox);

      return {
        action: 'vm_terminated',
        sandboxId: vmSession.sandboxId,
        message: `VM ${vmSession.sandboxId} cleaned up successfully`
      };
    } catch (error) {
      if (force) {
        // If force is true, consider it cleaned up even if deletion failed
        return {
          action: 'vm_terminated',
          sandboxId: vmSession.sandboxId,
          message: `VM ${vmSession.sandboxId} cleanup forced (may have been already deleted)`
        };
      }
      return { action: 'error', message: `Failed to cleanup VM: ${(error as Error).message}` };
    }
  },
  {
    name: "cleanup_vm",
    description: `Safely terminate and clean up VM resources.
    
    WHEN TO USE:
    - When finishing pentesting session to free up resources
    - To clean up VMs that are no longer needed
    - When switching to a different repository/context
    - For resource management and cost optimization
    
    BEHAVIOR:
    - Terminates and deletes the VM identified by sandboxId in state
    - Permanently removes the VM and all its data
    - Updates state to reflect VM termination
    
    CAUTION:
    - This operation is irreversible - all VM data will be lost
    - Make sure to save any important results before cleanup
    
    RETURNS:
    - action: 'vm_terminated' | 'error'
    - sandboxId: ID of the cleaned up VM
    - message: Success/failure details`,
    schema: z.object({
      force: z.boolean().optional().describe("Force cleanup even if deletion fails (default false)")
    })
  }
);

export const listBackgroundProcessesTool = tool(
  async ({}: {}, config: LangGraphRunnableConfig) => {
    // Access the current graph state using getCurrentTaskInput()
    const state = getCurrentTaskInput() as PentestAgentStateType;
    const vmSession = state?.vm_session;
    
    // Config is available for runtime values (thread_id, toolCall.id, etc.)
    const threadId = config.configurable?.thread_id;
    const processes = vmSession?.backgroundProcesses || [];
    
    if (processes.length === 0) {
      return {
        action: 'process_list',
        processes: [],
        message: 'No background processes tracked'
      };
    }

    return {
      action: 'process_list',
      processes: processes.map((p: any) => ({
        pid: p.pid,
        command: p.command,
        startedAt: p.startedAt,
        cwd: p.cwd,
        logFile: p.logFile,
        status: p.status || 'running'
      })),
      message: `Found ${processes.length} background process(es)`
    };
  },
  {
    name: "list_background_processes",
    description: `List all tracked background processes in the VM.
    
    WHEN TO USE:
    - To see what background processes are currently running
    - Before killing processes to see available PIDs
    - For debugging long-running tasks
    - To check process status and log files
    
    RETURNS:
    - action: 'process_list'
    - processes: Array of process info (pid, command, startedAt, cwd, logFile, status)
    - message: Summary of found processes`,
    schema: z.object({})
  }
);

export const killBackgroundProcessTool = tool(
  async ({ pid, signal }: { pid: string; signal?: string }, config: LangGraphRunnableConfig) => {
    // Access the current graph state using getCurrentTaskInput()
    const state = getCurrentTaskInput() as PentestAgentStateType;
    const ctx = resolveContext(state);
    // With getCurrentTaskInput() and DeepAgents, vm_session is directly in state
    const vm = state?.vm_session;
    
    // Config is available for runtime values (thread_id, toolCall.id, etc.)
    const threadId = config.configurable?.thread_id;
    
    const daytona = new Daytona({
      apiKey: process.env.DAYTONA_API_KEY,
      apiUrl: process.env.DAYTONA_API_URL || 'https://app.daytona.io/api',
      target: (process.env.DAYTONA_TARGET as any) || 'us',
    });

    // Resolve sandbox: prefer state, then labels
    let targetSandboxId: string | undefined = vm?.sandboxId;
    let sandbox: any = undefined;
    if (targetSandboxId) {
      try { sandbox = await daytona.get(targetSandboxId); } catch {}
    }
    if (!sandbox) {
      try {
        const labels = buildSandboxLabels(ctx, vm);
        sandbox = await daytona.findOne({ labels });
        if (sandbox) targetSandboxId = sandbox.id;
      } catch {}
    }
    if (!sandbox) return { error: "No active VM. Create/resume first." };

    try {
      const killSignal = signal || 'TERM';
      const killCmd = `kill -${killSignal} ${pid}`;
      
      const res = await sandbox.process.executeCommand(killCmd, HOME, undefined, 10);
      
      return {
        action: 'process_killed',
        pid,
        signal: killSignal,
        sandboxId: targetSandboxId,
        message: `Process ${pid} killed with signal ${killSignal}`,
        stdout: res?.artifacts?.stdout
      };
    } catch (error) {
      return { 
        action: 'error', 
        message: `Failed to kill process ${pid}: ${(error as Error).message}` 
      };
    }
  },
  {
    name: "kill_background_process",
    description: `Kill a background process by PID.
    
    WHEN TO USE:
    - To stop long-running background processes (npm run dev, etc.)
    - When a process is consuming too many resources
    - To clean up processes before VM shutdown
    - When switching between different development servers
    
    PARAMETERS:
    - pid (required string): Process ID to kill (from exec_shell_vm background result)
    - signal (optional string): Kill signal to send (default 'TERM', can use 'KILL' for force)
    
    RETURNS:
    - action: 'process_killed' | 'error'
    - pid: Process ID that was killed
    - signal: Signal that was sent
    - message: Success/failure details`,
    schema: z.object({
      pid: z.string().describe("Process ID to kill"),
      signal: z.string().optional().describe("Kill signal (default TERM, use KILL for force)")
    })
  }
);

export const checkProcessStatusTool = tool(
  async ({ pid }: { pid: string }, config: LangGraphRunnableConfig) => {
    // Access the current graph state using getCurrentTaskInput()
    const state = getCurrentTaskInput() as PentestAgentStateType;
    const ctx = resolveContext(state);
    // With getCurrentTaskInput() and DeepAgents, vm_session is directly in state
    const vm = state?.vm_session;
    
    // Config is available for runtime values (thread_id, toolCall.id, etc.)
    const threadId = config.configurable?.thread_id;
    
    const daytona = new Daytona({
      apiKey: process.env.DAYTONA_API_KEY,
      apiUrl: process.env.DAYTONA_API_URL || 'https://app.daytona.io/api',
      target: (process.env.DAYTONA_TARGET as any) || 'us',
    });

    // Resolve sandbox: prefer state, then labels
    let targetSandboxId: string | undefined = vm?.sandboxId;
    let sandbox: any = undefined;
    if (targetSandboxId) {
      try { sandbox = await daytona.get(targetSandboxId); } catch {}
    }
    if (!sandbox) {
      try {
        const labels = buildSandboxLabels(ctx, vm);
        sandbox = await daytona.findOne({ labels });
        if (sandbox) targetSandboxId = sandbox.id;
      } catch {}
    }
    if (!sandbox) return { error: "No active VM. Create/resume first." };

    try {
      // Check if process is still running
      const checkCmd = `ps -p ${pid} -o pid,ppid,cmd --no-headers`;
      const res = await sandbox.process.executeCommand(checkCmd, HOME, undefined, 10);
      
      const isRunning = (res?.artifacts?.stdout?.trim().length || 0) > 0;
      
      return {
        action: 'process_status',
        sandboxId: targetSandboxId,
        pid,
        isRunning,
        processInfo: res?.artifacts?.stdout?.trim() || null,
        message: isRunning ? `Process ${pid} is running` : `Process ${pid} is not running`
      };
    } catch (error) {
      return { 
        action: 'error', 
        message: `Failed to check process ${pid}: ${(error as Error).message}` 
      };
    }
  },
  {
    name: "check_process_status",
    description: `Check if a background process is still running.
    
    WHEN TO USE:
    - To verify if a background process is still active
    - Before attempting to kill a process
    - For monitoring long-running tasks
    - To debug process issues
    
    PARAMETERS:
    - pid (required string): Process ID to check
    
    RETURNS:
    - action: 'process_status' | 'error'
    - pid: Process ID that was checked
    - isRunning: boolean indicating if process is active
    - processInfo: Process details if running
    - message: Status summary`,
    schema: z.object({
      pid: z.string().describe("Process ID to check")
    })
  }
);

export const vmLsTool = tool(
  async ({ path }: { path?: string }, config: LangGraphRunnableConfig) => {
    // Access the current graph state using getCurrentTaskInput()
    const state = getCurrentTaskInput() as PentestAgentStateType;
    const ctx = resolveContext(state);
    // With getCurrentTaskInput() and DeepAgents, vm_session is directly in state
    const vm = state?.vm_session;
    
    // Config is available for runtime values (thread_id, toolCall.id, etc.)
    const threadId = config.configurable?.thread_id;
    
    const daytona = new Daytona({
      apiKey: process.env.DAYTONA_API_KEY,
      apiUrl: process.env.DAYTONA_API_URL || "https://app.daytona.io/api",
      target: (process.env.DAYTONA_TARGET as any) || "us",
    });

    // Resolve sandbox: prefer state, then labels
    let targetSandboxId: string | undefined = vm?.sandboxId;
    let sandbox: any = undefined;
    if (targetSandboxId) {
      try { sandbox = await daytona.get(targetSandboxId); } catch {}
    }
    if (!sandbox) {
      try {
        const labels = buildSandboxLabels(ctx, vm);
        sandbox = await daytona.findOne({ labels });
        if (sandbox) targetSandboxId = sandbox.id;
      } catch {}
    }
    if (!sandbox) return { error: "No active VM. Create/resume first." };

    try {
      const targetPath = path || vm?.workingDirectory || HOME;
      const cmd = `ls -la "${targetPath}"`;
      
      const res = await sandbox.process.executeCommand(cmd, HOME, undefined, 30);
      
      const exitCode = (res as any)?.exitCode ?? 0;
      const stdout = res?.artifacts?.stdout || '';
      return {
        action: 'vm_ls',
        ok: exitCode === 0,
        sandboxId: targetSandboxId,
        path: targetPath,
        stdout,
        message: `Listed files in ${targetPath}`
      };
    } catch (error) {
      return { 
        action: 'error', 
        message: `Failed to list files: ${(error as Error).message}` 
      };
    }
  },
  {
    name: "vm_ls",
    description: `List files and directories in the VM filesystem.
    
    WHEN TO USE:
    - To explore the VM filesystem structure
    - To check if files/directories exist in the VM
    - To see file permissions and sizes
    - For debugging file-related issues
    
    PARAMETERS:
    - path (optional string): Directory path to list (defaults to working directory or /home/daytona)
    
    RETURNS:
    - action: 'vm_ls' | 'error'
    - path: Directory that was listed
    - stdout: Raw ls -la output
    - message: Summary of operation`,
    schema: z.object({
      path: z.string().optional().describe("Directory path to list (defaults to working directory)")
    })
  }
);

export const vmReadFileTool = tool(
  async ({ filePath, startLine, endLine, maxLines, maxChars }: { filePath: string; startLine?: number; endLine?: number; maxLines?: number; maxChars?: number }, config: LangGraphRunnableConfig) => {
    // Access the current graph state using getCurrentTaskInput()
    const state = getCurrentTaskInput() as PentestAgentStateType;
    const ctx = resolveContext(state);
    // With getCurrentTaskInput() and DeepAgents, vm_session is directly in state
    const vm = state?.vm_session;
    
    // Config is available for runtime values (thread_id, toolCall.id, etc.)
    const threadId = config.configurable?.thread_id;
    
    const daytona = new Daytona({
      apiKey: process.env.DAYTONA_API_KEY,
      apiUrl: process.env.DAYTONA_API_URL || "https://app.daytona.io/api",
      target: (process.env.DAYTONA_TARGET as any) || "us",
    });

    // Resolve sandbox: prefer state, then labels
    let targetSandboxId: string | undefined = vm?.sandboxId;
    let sandbox: any = undefined;
    if (targetSandboxId) {
      try { sandbox = await daytona.get(targetSandboxId); } catch {}
    }
    if (!sandbox) {
      try {
        const labels = buildSandboxLabels(ctx, vm);
        sandbox = await daytona.findOne({ labels });
        if (sandbox) targetSandboxId = sandbox.id;
      } catch {}
    }
    if (!sandbox) return { error: "No active VM. Create/resume first." };

    try {
      let cmd: string;
      let description = '';
      
      // Build command based on parameters
      if (startLine && endLine) {
        cmd = `sed -n '${startLine},${endLine}p' "${filePath}"`;
        description = `lines ${startLine}-${endLine}`;
      } else if (startLine) {
        cmd = `tail -n +${startLine} "${filePath}"`;
        description = `from line ${startLine}`;
        if (maxLines) {
          cmd += ` | head -n ${maxLines}`;
          description += ` (max ${maxLines} lines)`;
        }
      } else if (maxLines) {
        cmd = `head -n ${maxLines} "${filePath}"`;
        description = `first ${maxLines} lines`;
      } else {
        cmd = `cat "${filePath}"`;
        description = 'full file';
      }
      
      const res = await sandbox.process.executeCommand(cmd, vm?.workingDirectory || HOME, undefined, 60);
      let content = res?.artifacts?.stdout || '';
      const exitCode = (res as any)?.exitCode ?? 0;
      
      // Apply character limit if specified
      if (maxChars && content.length > maxChars) {
        content = content.substring(0, maxChars) + '\n... [content trimmed due to length]';
        description += ` (trimmed to ${maxChars} chars)`;
      }
      
      return {
        action: 'vm_read_file',
        ok: exitCode === 0,
        sandboxId: targetSandboxId,
        filePath,
        content,
        description,
        message: `Read file ${filePath} (${description})`
      };
    } catch (error) {
      return { 
        action: 'error', 
        message: `Failed to read file ${filePath}: ${(error as Error).message}` 
      };
    }
  },
  {
    name: "vm_read_file",
    description: `Read file contents from the VM filesystem with flexible range and size options.
    
    WHEN TO USE:
    - To examine source code files in the cloned repository
    - To read configuration files, logs, or documentation  
    - To inspect specific sections of large files
    - For debugging and investigation purposes
    
    PARAMETERS:
    - filePath (required string): Path to the file to read
    - startLine (optional number): Start reading from this line number
    - endLine (optional number): Stop reading at this line number (requires startLine)
    - maxLines (optional number): Maximum number of lines to read
    - maxChars (optional number): Maximum characters to return (truncates if exceeded)
    
    EXAMPLES:
    - vm_read_file(filePath: "app.js") → Read entire file
    - vm_read_file(filePath: "app.js", maxLines: 50) → First 50 lines
    - vm_read_file(filePath: "app.js", startLine: 100, endLine: 150) → Lines 100-150
    - vm_read_file(filePath: "large.log", startLine: 1000, maxLines: 100) → 100 lines from line 1000
    - vm_read_file(filePath: "config.json", maxChars: 2000) → First 2000 characters
    
    RETURNS:
    - action: 'vm_read_file' | 'error'
    - filePath: Path that was read
    - content: File contents (based on specified range/limits)
    - description: Human-readable description of what was read
    - message: Summary of operation`,
    schema: z.object({
      filePath: z.string().describe("Path to the file to read"),
      startLine: z.number().int().positive().optional().describe("Start reading from this line number"),
      endLine: z.number().int().positive().optional().describe("Stop reading at this line number (requires startLine)"),
      maxLines: z.number().int().positive().optional().describe("Maximum number of lines to read"),
      maxChars: z.number().int().positive().optional().describe("Maximum characters to return (truncates if exceeded)")
    })
  }
);

// New: Read multiple regions from a file efficiently
export const vmReadRegionsTool = tool(
  async (
    { filePath, regions, maxChars }: { filePath: string; regions: Array<{ startLine?: number; endLine?: number; anchorRegex?: string; before?: number; after?: number }>; maxChars?: number },
    config: LangGraphRunnableConfig
  ) => {
    const state = getCurrentTaskInput() as PentestAgentStateType;
    const ctx = resolveContext(state);
    const vm = state?.vm_session;
    const daytona = new Daytona({
      apiKey: process.env.DAYTONA_API_KEY,
      apiUrl: process.env.DAYTONA_API_URL || "https://app.daytona.io/api",
      target: (process.env.DAYTONA_TARGET as any) || "us",
    });

    // Resolve sandbox
    let sandbox: any;
    if (vm?.sandboxId) { try { sandbox = await daytona.get(vm.sandboxId); } catch {} }
    if (!sandbox) { try { const labels = buildSandboxLabels(ctx, vm); sandbox = await daytona.findOne({ labels }); } catch {} }
    if (!sandbox) return { error: 'No active VM. Create/resume first.' };

    // Build a single python to read all regions with anchors if provided
    const payload = Buffer.from(JSON.stringify({ filePath, regions, maxChars: maxChars ?? 0 }), 'utf-8').toString('base64');
    const py = [
      `python3 - <<'PY' "${payload}"`,
      "import sys,base64,json,re",
      "pl=json.loads(base64.b64decode(sys.argv[1]).decode('utf-8'))",
      "p=pl['filePath']; regs=pl['regions']; maxc=int(pl.get('maxChars') or 0)",
      "txt=open(p,'r',encoding='utf-8').read()",
      "lines=txt.splitlines(keepends=True)",
      "out=[]",
      "for r in regs:",
      "    s=r.get('startLine'); e=r.get('endLine'); ar=r.get('anchorRegex'); bf=int(r.get('before') or 0); af=int(r.get('after') or 0)",
      "    if ar:",
      "        m=re.search(ar, txt, flags=re.MULTILINE)",
      "        if m:",
      "            # derive around anchor line window",
      "            # find line index of anchor by counting newlines before m.start()",
      "            anch_line=txt[:m.start()].count('\n')+1",
      "            s=max(1, anch_line-bf)",
      "            e=min(len(lines), anch_line+af)",
      "        else:",
      "            s=1; e=min(len(lines), bf+af)",
      "    if isinstance(s,int) and isinstance(e,int) and s>0 and e>=s:",
      "        seg=''.join(lines[s-1:e])",
      "        if maxc>0 and len(seg)>maxc: seg=seg[:maxc]+'\n... [region trimmed]'",
      "        out.append({'startLine':s,'endLine':e,'content':seg})",
      "print(json.dumps({'regions':out}))",
      "PY"
    ].join("\n");

    const res = await sandbox.process.executeCommand(py, vm?.workingDirectory || HOME, undefined, 60);
    const stdout = res?.artifacts?.stdout || '';
    try {
      const json = JSON.parse(stdout);
      return { action: 'vm_read_regions', filePath, ...json };
    } catch {
      return { action: 'error', message: 'Failed to parse regions output' };
    }
  },
  {
    name: 'vm_read_regions',
    description: 'Read multiple regions from a file by line ranges or anchor regex with before/after windows.',
    schema: z.object({
      filePath: z.string(),
      regions: z.array(z.object({
        startLine: z.number().int().positive().optional(),
        endLine: z.number().int().positive().optional(),
        anchorRegex: z.string().optional(),
        before: z.number().int().min(0).optional(),
        after: z.number().int().min(0).optional(),
      })).min(1),
      maxChars: z.number().int().positive().optional()
    })
  }
);

export const vmWriteFileTool = tool(
  async ({ filePath, content, append, executable, checkExists }: { filePath: string; content: string; append?: boolean; executable?: boolean; checkExists?: boolean }, config: LangGraphRunnableConfig) => {
    // Access the current graph state using getCurrentTaskInput()
    const state = getCurrentTaskInput() as PentestAgentStateType;
    const ctx = resolveContext(state);
    // With getCurrentTaskInput() and DeepAgents, vm_session is directly in state
    const vm = state?.vm_session;
    
    // Config is available for runtime values (thread_id, toolCall.id, etc.)
    const threadId = config.configurable?.thread_id;
    
    const daytona = new Daytona({
      apiKey: process.env.DAYTONA_API_KEY,
      apiUrl: process.env.DAYTONA_API_URL || "https://app.daytona.io/api",
      target: (process.env.DAYTONA_TARGET as any) || "us",
    });

    // Resolve sandbox: prefer state, then labels
    let targetSandboxId: string | undefined = vm?.sandboxId;
    let sandbox: any = undefined;
    if (targetSandboxId) {
      try { sandbox = await daytona.get(targetSandboxId); } catch {}
    }
    if (!sandbox) {
      try {
        const labels = buildSandboxLabels(ctx, vm);
        sandbox = await daytona.findOne({ labels });
        if (sandbox) targetSandboxId = sandbox.id;
      } catch {}
    }
    if (!sandbox) return { error: "No active VM. Create/resume first." };

    try {
      // Check if file exists if requested
      if (checkExists) {
        const checkCmd = `test -f "${filePath}" && echo "EXISTS" || echo "NOT_EXISTS"`;
        const checkRes = await sandbox.process.executeCommand(checkCmd, vm?.workingDirectory || HOME, undefined, 10);
        const fileExists = (checkRes?.artifacts?.stdout || "").includes("EXISTS");
        
        if (fileExists) {
          return {
            action: 'vm_write_file',
            sandboxId: targetSandboxId,
            filePath,
            skipped: true,
            message: `File ${filePath} already exists (skipped due to checkExists=true)`
          };
        }
      }

      // Create directory if needed and write file
      const dirCreateCmd = `mkdir -p "$(dirname "${filePath}")"`;
      await sandbox.process.executeCommand(dirCreateCmd, vm?.workingDirectory || HOME, undefined, 30);
      
      // Robust, base64-safe and (for overwrite) atomic write
      const b64 = Buffer.from(content, 'utf-8').toString('base64');
      if (append) {
        const cmd = `bash -lc "echo '${b64}' | base64 -d >> \"${filePath}\""`;
        await sandbox.process.executeCommand(cmd, vm?.workingDirectory || HOME, undefined, 60);
      } else {
        const tmp = `${filePath}.tmp.${Date.now()}`;
        const cmd = `bash -lc "echo '${b64}' | base64 -d > \"${tmp}\" && mv \"${tmp}\" \"${filePath}\""`;
        await sandbox.process.executeCommand(cmd, vm?.workingDirectory || HOME, undefined, 60);
      }
      
      // Make executable if requested
      if (executable) {
        const chmodCmd = `chmod +x "${filePath}"`;
        await sandbox.process.executeCommand(chmodCmd, vm?.workingDirectory || HOME, undefined, 10);
      }
      
      return {
        action: 'vm_write_file',
        ok: true,
        sandboxId: targetSandboxId,
        filePath,
        bytesWritten: content.length,
        append: !!append,
        executable: !!executable,
        message: `${append ? 'Appended to' : 'Wrote'} file ${filePath} (${content.length} bytes)${executable ? ' [executable]' : ''}`
      };
    } catch (error) {
      return { 
        action: 'error', 
        message: `Failed to write file ${filePath}: ${(error as Error).message}` 
      };
    }
  },
  {
    name: "vm_write_file",
    description: `Write content to a file in the VM filesystem with advanced options for script management.
    
    WHEN TO USE:
    - To create configuration files, scripts, or documentation
    - To save analysis results or reports
    - To create reusable bash scripts for complex operations
    - For generating exploit scripts or proof-of-concepts
    
    PARAMETERS:
    - filePath (required string): Path where to write the file
    - content (required string): Content to write to the file
    - append (optional boolean): If true, append to file instead of overwriting
    - executable (optional boolean): If true, make file executable (chmod +x)
    - checkExists (optional boolean): If true, skip writing if file already exists
    
    SCRIPT MANAGEMENT EXAMPLES:
    - vm_write_file(filePath: "/home/daytona/scripts/project_scan.sh", content: "#!/bin/bash\\n...", executable: true, checkExists: true)
    - vm_write_file(filePath: "/home/daytona/scripts/vuln_check.sh", content: script_content, executable: true)
    
    RETURNS:
    - action: 'vm_write_file' | 'error'
    - filePath: Path that was written
    - bytesWritten: Number of bytes written (if written)
    - append: Whether content was appended
    - executable: Whether file was made executable
    - skipped: True if file existed and checkExists was true
    - message: Summary of operation`,
    schema: z.object({
      filePath: z.string().describe("Path where to write the file"),
      content: z.string().describe("Content to write to the file"),
      append: z.boolean().optional().describe("Append to file instead of overwriting (default false)"),
      executable: z.boolean().optional().describe("Make file executable with chmod +x (default false)"),
      checkExists: z.boolean().optional().describe("Skip writing if file already exists (default false)")
    })
  }
);

export const vmReadScriptOutputTool = tool(
  async ({ scriptName, maxChars }: { scriptName: string; maxChars?: number }, config: LangGraphRunnableConfig) => {
    // Access the current graph state using getCurrentTaskInput()
    const state = getCurrentTaskInput() as PentestAgentStateType;
    const ctx = resolveContext(state);
    // With getCurrentTaskInput() and DeepAgents, vm_session is directly in state
    const vm = state?.vm_session;
    
    // Config is available for runtime values (thread_id, toolCall.id, etc.)
    const threadId = config.configurable?.thread_id;
    
    const daytona = new Daytona({
      apiKey: process.env.DAYTONA_API_KEY,
      apiUrl: process.env.DAYTONA_API_URL || "https://app.daytona.io/api",
      target: (process.env.DAYTONA_TARGET as any) || "us",
    });

    // Resolve sandbox
    let targetSandboxId: string | undefined = vm?.sandboxId;
    let sandbox: any = undefined;
    if (targetSandboxId) {
      try { sandbox = await daytona.get(targetSandboxId); } catch {}
    }
    if (!sandbox) {
      try {
        const labels = buildSandboxLabels(ctx, vm);
        sandbox = await daytona.findOne({ labels });
        if (sandbox) targetSandboxId = sandbox.id;
      } catch {}
    }
    if (!sandbox) return { error: "No active VM. Create/resume first." };

    try {
      // Construct output file path
      const outputFileName = scriptName.endsWith('.output') ? scriptName : scriptName.replace('.sh', '.output');
      const outputPath = `/home/daytona/scripts/${outputFileName}`;
      
      // Check if output file exists and get info
      const statCmd = `stat -c "%Y %s" "${outputPath}" 2>/dev/null || echo "NOT_FOUND"`;
      const statRes = await sandbox.process.executeCommand(statCmd, HOME, undefined, 10);
      const statOutput = statRes?.artifacts?.stdout?.trim() || "";
      
      if (statOutput === "NOT_FOUND") {
        return {
          action: 'vm_read_script_output',
          scriptName,
          outputPath,
          exists: false,
          message: `No previous execution output found for ${scriptName}`
        };
      }
      
      const [timestamp, size] = statOutput.split(' ');
      const lastModified = new Date(parseInt(timestamp) * 1000).toISOString();
      
      // Read the output file
      const readCmd = `cat "${outputPath}"`;
      const readRes = await sandbox.process.executeCommand(readCmd, vm?.workingDirectory || HOME, undefined, 60);
      let content = readRes?.artifacts?.stdout || '';
      
      // Apply character limit if specified
      const maxCharLimit = maxChars || 4000;
      const isTrimmed = content.length > maxCharLimit;
      if (isTrimmed) {
        content = content.substring(0, maxCharLimit) + '\n... [output trimmed - use vm_read_file for full content]';
      }
      
      return {
        action: 'vm_read_script_output',
        scriptName,
        outputPath,
        exists: true,
        content,
        isTrimmed,
        fullSize: parseInt(size),
        lastModified,
        message: `Previous execution output for ${scriptName} (${size} bytes, modified ${lastModified})${isTrimmed ? ' [truncated]' : ''}`
      };
    } catch (error) {
      return { 
        action: 'error', 
        message: `Failed to read script output for ${scriptName}: ${(error as Error).message}` 
      };
    }
  },
  {
    name: "vm_read_script_output",
    description: `Read previous execution output from a script to avoid re-running and see historical results.
    
    WHEN TO USE:
    - Before running a script, check if it was executed recently by another agent
    - Review previous scan results or analysis outputs
    - Debug script executions by examining saved outputs
    - Share script results between different agents and sessions
    
    EXAMPLES:
    - vm_read_script_output(scriptName: "project_scan.sh") → See previous project analysis
    - vm_read_script_output(scriptName: "vuln_scan.output") → Check vulnerability scan results
    - vm_read_script_output(scriptName: "exploit_test.sh", maxChars: 2000) → Review penetration test output
    
    PARAMETERS:
    - scriptName (required): Script name (.sh) or output name (.output)
    - maxChars (optional): Maximum characters to return (default 4000)
    
    RETURNS:
    - exists: Whether the output file exists
    - content: Previous execution output (if exists)
    - outputPath: Full path to the output file
    - lastModified: When the script was last executed
    - fullSize: Original output size in bytes
    - isTrimmed: Whether output was truncated`,
    schema: z.object({
      scriptName: z.string().describe("Script name (project_scan.sh) or output file name (project_scan.output)"),
      maxChars: z.number().int().positive().optional().describe("Maximum characters to return (default 4000)")
    })
  }
);

export const vmReplaceInFileTool = tool(
  async (
    { filePath, oldString, newString, replaceAll }: { filePath: string; oldString: string; newString: string; replaceAll?: boolean },
    config: LangGraphRunnableConfig
  ) => {
    const state = getCurrentTaskInput() as PentestAgentStateType;
    const ctx = resolveContext(state);
    const vm = state?.vm_session;

    const daytona = new Daytona({
      apiKey: process.env.DAYTONA_API_KEY,
      apiUrl: process.env.DAYTONA_API_URL || "https://app.daytona.io/api",
      target: (process.env.DAYTONA_TARGET as any) || "us",
    });

    // Resolve sandbox
    let targetSandboxId: string | undefined = vm?.sandboxId;
    let sandbox: any = undefined;
    if (targetSandboxId) {
      try { sandbox = await daytona.get(targetSandboxId); } catch {}
    }
    if (!sandbox) {
      try {
        const labels = buildSandboxLabels(ctx, vm);
        sandbox = await daytona.findOne({ labels });
        if (sandbox) targetSandboxId = sandbox.id;
      } catch {}
    }
    if (!sandbox) return { error: "No active VM. Create/resume first." };

    if (!filePath) return { error: "filePath is required" };

    // Base64 encode to avoid shell escaping pitfalls
    const oldB64 = Buffer.from(oldString, 'utf-8').toString('base64');
    const newB64 = Buffer.from(newString, 'utf-8').toString('base64');
    const countExpr = replaceAll ? '-1' : '1';

    const py = [
      "python3 - <<'PY'",
      "import base64,sys; p=sys.argv[1];",
      "old=base64.b64decode(sys.argv[2]).decode('utf-8');",
      "new=base64.b64decode(sys.argv[3]).decode('utf-8');",
      "count=int(sys.argv[4]);",
      "try:\n    s=open(p,'r',encoding='utf-8').read()\nexcept FileNotFoundError:\n    print('NO_FILE'); sys.exit(3)",
      "occ=s.count(old)",
      "if occ==0:\n    print('NO_MATCH'); sys.exit(2)",
      "s=s.replace(old,new,occ if count<0 else count)",
      "open(p,'w',encoding='utf-8').write(s)",
      "print('OK',occ if count<0 else 1)",
      "PY",
      `"${filePath}" "${oldB64}" "${newB64}" "${countExpr}"`
    ].join("\n");

    try {
      const res = await sandbox.process.executeCommand(py, vm?.workingDirectory || HOME, undefined, 60);
      const out = (res?.artifacts?.stdout || '').trim();
      if (out.startsWith('NO_FILE')) return { action: 'vm_replace_in_file', filePath, replaced: 0, error: 'file_not_found' };
      if (out.startsWith('NO_MATCH')) return { action: 'vm_replace_in_file', filePath, replaced: 0, message: 'No match found' };
      const parts = out.trim().split(/\s+/);
      const replaced = parts.length>1 ? Number(parts[1]) || (replaceAll ? 0 : 1) : (replaceAll ? 0 : 1);
      const alreadyApplied = replaced === 0;
      // Provide tiny synthetic diff for UI if small replacement and occurred
      const diff = replaced > 0 ? `--- ${filePath}\n+++ ${filePath}\n@@\n-${oldString}\n+${newString}\n` : '';
      const parsed = diff ? parseUnifiedDiff(diff) : { hunks: [], totals: { added: 0, removed: 0 } };
      return { action: 'vm_replace_in_file', ok: true, filePath, replaced, replaceAll: !!replaceAll, alreadyApplied, diff: diff || undefined, parsedHunks: parsed.hunks, totals: parsed.totals };
    } catch (e) {
      return { action: 'error', message: `Replace failed: ${(e as Error).message}` };
    }
  },
  {
    name: "vm_replace_in_file",
    description: `Safely replace an exact string in a VM file. Uses in-VM Python to avoid shell escaping issues. Supports single or all occurrences. Returns number of replacements.`,
    schema: z.object({
      filePath: z.string().describe("Path to file to modify"),
      oldString: z.string().describe("Exact string to replace (case-sensitive)"),
      newString: z.string().describe("Replacement string"),
      replaceAll: z.boolean().optional().describe("Replace all occurrences (default: false for first only)")
    })
  }
);

export const vmReplaceRegexInFileTool = tool(
  async (
    { filePath, pattern, replacement, flags }: { filePath: string; pattern: string; replacement: string; flags?: string },
    config: LangGraphRunnableConfig
  ) => {
    const state = getCurrentTaskInput() as PentestAgentStateType;
    const ctx = resolveContext(state);
    const vm = state?.vm_session;

    const daytona = new Daytona({
      apiKey: process.env.DAYTONA_API_KEY,
      apiUrl: process.env.DAYTONA_API_URL || "https://app.daytona.io/api",
      target: (process.env.DAYTONA_TARGET as any) || "us",
    });

    let targetSandboxId: string | undefined = vm?.sandboxId;
    let sandbox: any = undefined;
    if (targetSandboxId) {
      try { sandbox = await daytona.get(targetSandboxId); } catch {}
    }
    if (!sandbox) {
      try {
        const labels = buildSandboxLabels(ctx, vm);
        sandbox = await daytona.findOne({ labels });
        if (sandbox) targetSandboxId = sandbox.id;
      } catch {}
    }
    if (!sandbox) return { error: "No active VM. Create/resume first." };

    if (!filePath) return { error: "filePath is required" };

    const patB64 = Buffer.from(pattern, 'utf-8').toString('base64');
    const repB64 = Buffer.from(replacement, 'utf-8').toString('base64');
    const flagsB64 = Buffer.from(flags || '', 'utf-8').toString('base64');

    const py = [
      "python3 - <<'PY'",
      "import base64,sys,re; p=sys.argv[1];",
      "pat=base64.b64decode(sys.argv[2]).decode('utf-8');",
      "rep=base64.b64decode(sys.argv[3]).decode('utf-8');",
      "fls=base64.b64decode(sys.argv[4]).decode('utf-8');",
      "f=0",
      "if 'i' in fls: f|=re.IGNORECASE",
      "if 'm' in fls: f|=re.MULTILINE",
      "if 's' in fls: f|=re.DOTALL",
      "try:\n    s=open(p,'r',encoding='utf-8').read()\nexcept FileNotFoundError:\n    print('NO_FILE'); sys.exit(3)",
      "new, n = re.subn(pat, rep, s, flags=f)",
      "if n==0:\n    print('NO_MATCH'); sys.exit(2)",
      "open(p,'w',encoding='utf-8').write(new)",
      "print('OK',n)",
      "PY",
      `"${filePath}" "${patB64}" "${repB64}" "${flagsB64}"`
    ].join("\n");

    try {
      const res = await sandbox.process.executeCommand(py, vm?.workingDirectory || HOME, undefined, 60);
      const out = (res?.artifacts?.stdout || '').trim();
      if (out.startsWith('NO_FILE')) return { action: 'vm_replace_regex_in_file', filePath, replaced: 0, error: 'file_not_found' };
      if (out.startsWith('NO_MATCH')) return { action: 'vm_replace_regex_in_file', filePath, replaced: 0, message: 'No match found' };
      const parts = out.trim().split(/\s+/);
      const replaced = parts.length>1 ? Number(parts[1]) || 0 : 0;
      const alreadyApplied = replaced === 0;
      return { action: 'vm_replace_regex_in_file', ok: true, filePath, replaced, alreadyApplied, flags: flags || '' };
    } catch (e) {
      return { action: 'error', message: `Regex replace failed: ${(e as Error).message}` };
    }
  },
  {
    name: "vm_replace_regex_in_file",
    description: `Regex-based in-place replacement in a VM file. Supports flags: i (ignorecase), m (multiline), s (dotall). Returns number of replacements.`,
    schema: z.object({
      filePath: z.string().describe("Path to file to modify"),
      pattern: z.string().describe("Python regex pattern"),
      replacement: z.string().describe("Replacement string (backreferences not supported)"),
      flags: z.string().optional().describe("Flags: i,m,s (combined as needed)")
    })
  }
);

export const vmApplyPatchHunkTool = tool(
  async (
    { filePath, oldBlock, newBlock }: { filePath: string; oldBlock: string; newBlock: string },
    config: LangGraphRunnableConfig
  ) => {
    const state = getCurrentTaskInput() as PentestAgentStateType;
    const ctx = resolveContext(state);
    const vm = state?.vm_session;

    const daytona = new Daytona({
      apiKey: process.env.DAYTONA_API_KEY,
      apiUrl: process.env.DAYTONA_API_URL || "https://app.daytona.io/api",
      target: (process.env.DAYTONA_TARGET as any) || "us",
    });

    let targetSandboxId: string | undefined = vm?.sandboxId;
    let sandbox: any = undefined;
    if (targetSandboxId) {
      try { sandbox = await daytona.get(targetSandboxId); } catch {}
    }
    if (!sandbox) {
      try {
        const labels = buildSandboxLabels(ctx, vm);
        sandbox = await daytona.findOne({ labels });
        if (sandbox) targetSandboxId = sandbox.id;
      } catch {}
    }
    if (!sandbox) return { error: "No active VM. Create/resume first." };

    if (!filePath) return { error: "filePath is required" };

    const oldB64 = Buffer.from(oldBlock, 'utf-8').toString('base64');
    const newB64 = Buffer.from(newBlock, 'utf-8').toString('base64');

    const py = [
      "python3 - <<'PY'",
      "import base64,sys; p=sys.argv[1];",
      "old=base64.b64decode(sys.argv[2]).decode('utf-8');",
      "new=base64.b64decode(sys.argv[3]).decode('utf-8');",
      "try:\n    s=open(p,'r',encoding='utf-8').read()\nexcept FileNotFoundError:\n    print('NO_FILE'); sys.exit(3)",
      "cnt=s.count(old)",
      "if cnt==0:\n    print('NO_MATCH'); sys.exit(2)",
      "if cnt>1:\n    print('MULTI_MATCH'); sys.exit(4)",
      "s=s.replace(old,new,1)",
      "open(p,'w',encoding='utf-8').write(s)",
      "print('OK')",
      "PY",
      `"${filePath}" "${oldB64}" "${newB64}"`
    ].join("\n");

    try {
      const res = await sandbox.process.executeCommand(py, vm?.workingDirectory || HOME, undefined, 60);
      const out = (res?.artifacts?.stdout || '').trim();
      if (out.startsWith('NO_FILE')) return { action: 'vm_apply_patch_hunk', filePath, replaced: 0, error: 'file_not_found' };
      if (out.startsWith('NO_MATCH')) return { action: 'vm_apply_patch_hunk', filePath, replaced: 0, error: 'old_block_not_found' };
      if (out.startsWith('MULTI_MATCH')) return { action: 'vm_apply_patch_hunk', filePath, replaced: 0, error: 'old_block_not_unique' };
      return { action: 'vm_apply_patch_hunk', ok: true, filePath, replaced: 1 };
    } catch (e) {
      return { action: 'error', message: `Patch hunk failed: ${(e as Error).message}` };
    }
  },
  {
    name: "vm_apply_patch_hunk",
    description: `Apply a single, unique multi-line hunk change in a VM file by replacing an exact oldBlock with newBlock. Fails if the oldBlock is missing or appears more than once (uniqueness guard). Use for precise, context-based diffs without editing entire files.`,
    schema: z.object({
      filePath: z.string().describe("Path to file to modify"),
      oldBlock: z.string().describe("Exact multi-line block to replace (must be unique in file)"),
      newBlock: z.string().describe("Replacement block")
    })
  }
);

export const vmModifyWithDiffTool = tool(
  async (
    { filePath, newContent, contextLines, makeExecutable, oldBlock, newBlock, occurrenceIndex, startLine, endLine, rangeReplacement, applyMode }: { filePath: string; newContent?: string; contextLines?: number; makeExecutable?: boolean; oldBlock?: string; newBlock?: string; occurrenceIndex?: number; startLine?: number; endLine?: number; rangeReplacement?: string; applyMode?: 'preview' | 'apply' },
    config: LangGraphRunnableConfig
  ) => {
    const state = getCurrentTaskInput() as PentestAgentStateType;
    const ctx = resolveContext(state);
    const vm = state?.vm_session;

    const daytona = new Daytona({
      apiKey: process.env.DAYTONA_API_KEY,
      apiUrl: process.env.DAYTONA_API_URL || "https://app.daytona.io/api",
      target: (process.env.DAYTONA_TARGET as any) || "us",
    });

    // Resolve sandbox
    let targetSandboxId: string | undefined = vm?.sandboxId;
    let sandbox: any = undefined;
    if (targetSandboxId) {
      try { sandbox = await daytona.get(targetSandboxId); } catch {}
    }
    if (!sandbox) {
      try {
        const labels = buildSandboxLabels(ctx, vm);
        sandbox = await daytona.findOne({ labels });
        if (sandbox) targetSandboxId = sandbox.id;
      } catch {}
    }
    if (!sandbox) return { error: "No active VM. Create/resume first." };

    if (!filePath) return { error: "filePath is required" };

    // Build payload supporting modes: full, block, range
    const payload = {
      mode: newContent ? 'full' : (oldBlock && newBlock ? 'block' : (typeof startLine === 'number' && typeof endLine === 'number' ? 'range' : 'full')),
      newContent: newContent ?? null,
      oldBlock: oldBlock ?? null,
      newBlock: newBlock ?? null,
      occurrenceIndex: typeof occurrenceIndex === 'number' ? occurrenceIndex : null,
      startLine: typeof startLine === 'number' ? startLine : null,
      endLine: typeof endLine === 'number' ? endLine : null,
      rangeReplacement: rangeReplacement ?? null,
      contextLines: typeof contextLines === 'number' && contextLines >= 0 ? contextLines : 3,
      dryRun: applyMode === 'preview'
    } as const;

    const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64');

    const py = [
      `python3 - "${filePath}" "${payloadB64}" <<'PY'`,
      "import base64,sys,os,difflib,json",
      "p=sys.argv[1]",
      "pl=json.loads(base64.b64decode(sys.argv[2]).decode('utf-8'))",
      "mode=pl.get('mode','full')",
      "nctx=int(pl.get('contextLines',3))",
      "dry=bool(pl.get('dryRun', False))",
      "try:",
      "    old=open(p,'r',encoding='utf-8').read()",
      "    existed=True",
      "except FileNotFoundError:",
      "    old=''",
      "    existed=False",
      "new=old",
      "replaced_count=0",
      "if mode=='full':",
      "    nc=pl.get('newContent') or ''",
      "    new=nc",
      "else:",
      "    if mode=='block':",
      "        oldb=pl.get('oldBlock') or ''",
      "        newb=pl.get('newBlock') or ''",
      "        idx=pl.get('occurrenceIndex')",
      "        cnt=old.count(oldb) if oldb else 0",
      "        if cnt==0:",
      "            print('NO_MATCH'); sys.exit(2)",
      "        if idx is None:",
      "            if cnt>1:",
      "                print('MULTI_MATCH'); sys.exit(4)",
      "            new=old.replace(oldb,newb,1); replaced_count=1",
      "        else:",
      "            pos=-1; start=0",
      "            for i in range(cnt):",
      "                pos=old.find(oldb,start)",
      "                if i+1==int(idx):",
      "                    break",
      "                start=pos+len(oldb)",
      "            if pos<0:",
      "                print('NO_MATCH_INDEX'); sys.exit(5)",
      "            new=old[:pos]+newb+old[pos+len(oldb):]; replaced_count=1",
      "    elif mode=='range':",
      "        s=pl.get('startLine'); e=pl.get('endLine'); rep=pl.get('rangeReplacement') or ''",
      "        if not (isinstance(s,int) and isinstance(e,int) and s>0 and e>=s):",
      "            print('BAD_RANGE'); sys.exit(6)",
      "        lines=old.splitlines(keepends=True)",
      "        before=lines[:s-1]; after=lines[e:]",
      "        new=''.join(before)+rep+''.join(after); replaced_count=1",
      "    else:",
      "        pass",
      "old_lines=old.splitlines(keepends=True)",
      "new_lines=new.splitlines(keepends=True)",
      "ud=list(difflib.unified_diff(old_lines,new_lines,fromfile=p,tofile=p,n=nctx))",
      "diff=''.join(ud)",
      "added=0; removed=0",
      "for ln in ud:",
      "    if ln.startswith('+++') or ln.startswith('---') or ln.startswith('@@'):",
      "        continue",
      "    if ln.startswith('+'):",
      "        added+=1",
      "    elif ln.startswith('-'):",
      "        removed+=1",
      "os.makedirs(os.path.dirname(p) or '.', exist_ok=True)",
      "if not dry:",
      "    open(p,'w',encoding='utf-8').write(new)",
      "print('OK')",
      "print('---DIFF_START---')",
      "print(diff,end='')",
      "print('\\n---DIFF_END---')",
      "print('META existed:' + str(existed) + ' mode:' + str(mode) + ' replaced:' + str(replaced_count) + ' added:' + str(added) + ' removed:' + str(removed) + ' old_len:' + str(len(old_lines)) + ' new_len:' + str(len(new_lines)) + ' dry:' + str(dry))",
      "PY"
    ].join("\n");

    try {
      const res = await sandbox.process.executeCommand(py, vm?.workingDirectory || HOME, undefined, 120);
      const out = (res?.artifacts?.stdout || '').trim();
      if (!out.startsWith('OK')) return { action: 'vm_modify_with_diff', filePath, error: 'unexpected_output', stdout: out };

      const diffMatch = out.match(/---DIFF_START---[\s\S]*?---DIFF_END---/);
      const metaMatch = out.match(/META\s+.*$/m);
      const diff = diffMatch ? diffMatch[0].replace('---DIFF_START---\n','').replace('\n---DIFF_END---','') : '';
      const meta = metaMatch ? metaMatch[0] : '';
      const parsed = parseUnifiedDiff(diff);

      if (makeExecutable && applyMode !== 'preview') {
        try { await sandbox.process.executeCommand(`chmod +x "${filePath}"`, vm?.workingDirectory || HOME, undefined, 10); } catch {}
      }

      return {
        action: 'vm_modify_with_diff',
        sandboxId: targetSandboxId,
        filePath,
        diff,
        meta,
        parsedHunks: parsed.hunks,
        totals: parsed.totals,
        executable: !!makeExecutable,
        preview: applyMode === 'preview',
        message: applyMode === 'preview' ? 'Preview diff returned (no write performed)' : 'File modified with unified diff returned'
      };
    } catch (e) {
      return { action: 'error', message: `Modify with diff failed: ${(e as Error).message}` };
    }
  },
  {
    name: 'vm_modify_with_diff',
    description: `Modify a file and return a GitHub-style unified diff. Modes: full (newContent), block (oldBlock→newBlock with optional occurrenceIndex), range (startLine..endLine → rangeReplacement).`,
    schema: z.object({
      filePath: z.string().describe('Path to file to modify'),
      newContent: z.string().optional().describe('Full new file content'),
      oldBlock: z.string().optional().describe('Exact old block to replace'),
      newBlock: z.string().optional().describe('Replacement block for oldBlock'),
      occurrenceIndex: z.number().int().positive().optional().describe('1-based index if oldBlock appears multiple times'),
      startLine: z.number().int().positive().optional().describe('Start line (inclusive) for range mode'),
      endLine: z.number().int().positive().optional().describe('End line (inclusive) for range mode'),
      rangeReplacement: z.string().optional().describe('Replacement content for the specified line range'),
      contextLines: z.number().int().min(0).optional().describe('Unified diff context lines (default 3)'),
      makeExecutable: z.boolean().optional().describe('chmod +x after write'),
      applyMode: z.enum(['preview','apply']).optional().describe('Preview to return diff without writing (default apply)')
    })
  }
);

// New: Structured ripgrep search in the VM (fast, LLM-friendly)
export const vmRgSearchTool = tool(
  async (
    { pattern, regex, globs, cwd, maxResults, before, after }: { pattern: string; regex?: boolean; globs?: string[]; cwd?: string; maxResults?: number; before?: number; after?: number },
    config: LangGraphRunnableConfig
  ) => {
    const state = getCurrentTaskInput() as PentestAgentStateType;
    const ctx = resolveContext(state);
    const vm = state?.vm_session;
    const daytona = new Daytona({
      apiKey: process.env.DAYTONA_API_KEY,
      apiUrl: process.env.DAYTONA_API_URL || "https://app.daytona.io/api",
      target: (process.env.DAYTONA_TARGET as any) || "us",
    });
    let sandbox: any;
    if (vm?.sandboxId) { try { sandbox = await daytona.get(vm.sandboxId); } catch {} }
    if (!sandbox) { try { const labels = buildSandboxLabels(ctx, vm); sandbox = await daytona.findOne({ labels }); } catch {} }
    if (!sandbox) return { error: 'No active VM. Create/resume first.' };

    const flags = ["--line-number", "--no-heading", "--color", "never"];
    if (!regex) flags.push("-F");
    const ctxOpt = (before && before > 0) || (after && after > 0) ? ["-C", String(Math.max(before || 0, after || 0))] : [];
    const globArgs = (globs || []).flatMap(g => ["--glob", `'${g.replace(/'/g, "'\\''")}'`]);
    const pat = `'${pattern.replace(/'/g, "'\\''")}'`;
    const limit = maxResults && maxResults > 0 ? ` | head -n ${maxResults}` : '';
    const baseCwd = cwd || vm?.workingDirectory || HOME;
    const cmd = `bash -lc "rg ${flags.join(' ')} ${ctxOpt.join(' ')} ${globArgs.join(' ')} ${pat} .${limit}"`;

    const res = await sandbox.process.executeCommand(cmd, baseCwd, undefined, 60);
    const stdout = (res?.artifacts?.stdout || '').trim();
    const lines = stdout ? stdout.split('\n') : [];
    const results = [] as Array<{ filePath: string; line: number; preview: string }>;
    for (const line of lines) {
      const idx1 = line.indexOf(':'); if (idx1 < 0) continue;
      const idx2 = line.indexOf(':', idx1 + 1); if (idx2 < 0) continue;
      const path = line.slice(0, idx1);
      const lineNum = Number(line.slice(idx1 + 1, idx2));
      const preview = line.slice(idx2 + 1);
      if (!isFinite(lineNum)) continue;
      results.push({ filePath: path, line: lineNum, preview });
    }
    return { action: 'vm_rg_search', ok: true, cwd: baseCwd, count: results.length, results };
  },
  {
    name: 'vm_rg_search',
    description: 'Search code in the VM using ripgrep with structured results (filePath, line, preview).',
    schema: z.object({
      pattern: z.string().describe('Search pattern (regex by default)'),
      regex: z.boolean().optional().describe('Treat pattern as regex (default true). If false, uses fixed string'),
      globs: z.array(z.string()).optional().describe('Additional glob filters passed to rg --glob'),
      cwd: z.string().optional().describe('Working directory (defaults to repo working dir)'),
      maxResults: z.number().int().positive().optional().describe('Limit total results returned'),
      before: z.number().int().min(0).optional().describe('Context lines before match (informational)'),
      after: z.number().int().min(0).optional().describe('Context lines after match (informational)')
    })
  }
);

// New: Batch edit multiple files/operations and return aggregated diffs
export const vmBatchEditTool = tool(
  async (
    { operations, contextLines, applyMode }: { operations: any[]; contextLines?: number; applyMode?: 'preview' | 'apply' },
    config: LangGraphRunnableConfig
  ) => {
    const state = getCurrentTaskInput() as PentestAgentStateType;
    const ctx = resolveContext(state);
    const vm = state?.vm_session;
    const daytona = new Daytona({
      apiKey: process.env.DAYTONA_API_KEY,
      apiUrl: process.env.DAYTONA_API_URL || "https://app.daytona.io/api",
      target: (process.env.DAYTONA_TARGET as any) || "us",
    });
    let sandbox: any;
    if (vm?.sandboxId) { try { sandbox = await daytona.get(vm.sandboxId); } catch {} }
    if (!sandbox) { try { const labels = buildSandboxLabels(ctx, vm); sandbox = await daytona.findOne({ labels }); } catch {} }
    if (!sandbox) return { error: 'No active VM. Create/resume first.' };

    const payload = Buffer.from(JSON.stringify({ operations, contextLines: typeof contextLines === 'number' ? contextLines : 3, dryRun: applyMode === 'preview' }), 'utf-8').toString('base64');
    const py = [
      `python3 - <<'PY' "${payload}"`,
      "import sys,base64,json,os,difflib,re",
      "pl=json.loads(base64.b64decode(sys.argv[1]).decode('utf-8'))",
      "ops=pl.get('operations',[])",
      "nctx=int(pl.get('contextLines',3))",
      "dry=bool(pl.get('dryRun',False))",
      "results=[]",
      "for op in ops:",
      "    tp=op.get('type'); p=op.get('filePath')",
      "    if not p or not tp: results.append({'ok':False,'error':'bad_op'}); continue",
      "    try:\n        old=''\n        existed=False\n        try:\n            old=open(p,'r',encoding='utf-8').read()\n            existed=True\n        except FileNotFoundError:\n            old=''\n        new=old\n        replaced=0\n        if tp=='full':\n            new=str(op.get('newContent') or '')\n        elif tp=='write':\n            content=str(op.get('content') or '')\n            if bool(op.get('append')):\n                new = old + content\n            else:\n                new = content\n        elif tp=='exact':\n            oldS=str(op.get('oldString') or '')\n            newS=str(op.get('newString') or '')\n            cnt=old.count(oldS)\n            if cnt==0:\n                pass\n            else:\n                new=old.replace(oldS,newS, cnt if bool(op.get('replaceAll')) else 1)\n                replaced = cnt if bool(op.get('replaceAll')) else 1\n        elif tp=='regex':\n            pat=str(op.get('pattern') or '')\n            rep=str(op.get('replacement') or '')\n            fls=str(op.get('flags') or '')\n            f=0\n            if 'i' in fls: f|=re.IGNORECASE\n            if 'm' in fls: f|=re.MULTILINE\n            if 's' in fls: f|=re.DOTALL\n            new, replaced = re.subn(pat, rep, old, flags=f)\n        elif tp=='hunk':\n            oldb=str(op.get('oldBlock') or '')\n            newb=str(op.get('newBlock') or '')\n            idx=op.get('occurrenceIndex')\n            cnt=old.count(oldb) if oldb else 0\n            if cnt==1 and (idx is None or idx==1):\n                new=old.replace(oldb,newb,1); replaced=1\n            elif cnt>1:\n                if idx is None:\n                    raise Exception('MULTI_MATCH')\n                pos=-1; start=0\n                for i in range(cnt):\n                    pos=old.find(oldb,start)\n                    if i+1==int(idx): break\n                    start=pos+len(oldb)\n                if pos<0: raise Exception('NO_MATCH_INDEX')\n                new=old[:pos]+newb+old[pos+len(oldb):]; replaced=1\n            else:\n                pass\n        elif tp=='range':\n            s=op.get('startLine'); e=op.get('endLine'); rep=str(op.get('rangeReplacement') or '')\n            if isinstance(s,int) and isinstance(e,int) and s>0 and e>=s:\n                lines=old.splitlines(keepends=True)\n                before=lines[:s-1]; after=lines[e:]\n                new=''.join(before)+rep+''.join(after); replaced=1\n        else:\n            results.append({'ok':False,'error':'unknown_type','type':tp}); continue\n        old_lines=old.splitlines(keepends=True)\n        new_lines=new.splitlines(keepends=True)\n        ud=list(difflib.unified_diff(old_lines,new_lines,fromfile=p,tofile=p,n=nctx))\n        diff=''.join(ud)\n        if not dry:\n            os.makedirs(os.path.dirname(p) or '.', exist_ok=True)\n            open(p,'w',encoding='utf-8').write(new)\n        results.append({'ok':True,'filePath':p,'type':tp,'replaced':replaced,'diff':diff,'existed':existed})\n    except Exception as e:\n        results.append({'ok':False,'filePath':p,'type':tp,'error':str(e)})",
      "print(json.dumps({'results':results,'dry':dry}))",
      "PY"
    ].join('\n');

    const res = await sandbox.process.executeCommand(py, vm?.workingDirectory || HOME, undefined, 120);
    const stdout = (res?.artifacts?.stdout || '').trim();
    try {
      const json = JSON.parse(stdout);
      const ok = Array.isArray(json.results) && json.results.every((r: any) => r.ok);
      // Parse each unified diff for frontend-ready hunks
      const enhanced = (json.results || []).map((r: any) => {
        if (r && r.diff) {
          const parsed = parseUnifiedDiff(r.diff);
          return { ...r, parsedHunks: parsed.hunks, totals: parsed.totals };
        }
        return r;
      });
      return { action: 'vm_batch_edit', ok, preview: applyMode === 'preview', results: enhanced, dry: json.dry };
    } catch {
      return { action: 'vm_batch_edit', ok: false, error: 'Failed to parse batch edit output', stdout };
    }
  },
  {
    name: 'vm_batch_edit',
    description: 'Apply multiple edit operations across files in a single call; returns per-op diffs and status. Supports preview mode.',
    schema: z.object({
      operations: z.array(z.any()).min(1).describe('Operations with type and filePath'),
      contextLines: z.number().int().min(0).optional(),
      applyMode: z.enum(['preview','apply']).optional()
    })
  }
);

