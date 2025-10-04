import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { Daytona } from "@daytonaio/sdk";
import { getCurrentTaskInput, type LangGraphRunnableConfig } from "@langchain/langgraph";
import { resolveContext } from "../lib/context-helpers";
import { type PentestAgentStateType } from "../state";

// Helper: build consistent Daytona labels for sandbox discovery/deduplication
function buildSandboxLabels(context: any, vmSession?: any): Record<string, string> {
  const mode = context?.mode || (context?.targetRepo ? 'repo' : 'scratch');
  const labels: Record<string, string> = {
    type: "pentesting",
    mode: mode, // 🔥 Add mode label to distinguish scratch vs repo VMs
  };
  if (context?.githubUsername) labels.user = String(context.githubUsername);
  if (context?.targetRepo) labels.repo = String(context.targetRepo);
  if (vmSession?.sessionId) labels.sessionId = String(vmSession.sessionId);
  return labels;
}

// Enhanced VM Management Tool (simplified)
export const manageVMContextTool = tool(
  async ({ action, id, labels: labelFilter, command, cwd, env, branch, timeout }: { action: string, id?: string, labels?: Record<string,string>, command?: string, cwd?: string, env?: Record<string,string>, branch?: string, timeout?: number }, config: LangGraphRunnableConfig) => {
    // Access the current graph state using getCurrentTaskInput()
    const state = getCurrentTaskInput() as PentestAgentStateType;
    // Use same context resolution logic as get_context tool
    const context = resolveContext(state);
    const vmSession = state?.vm_session;

    // 🔥 MODE-AWARE: Read mode directly from state (set by get_context via post-model hook)
    const mode = state?.context?.mode || context.mode || (context.targetRepo ? 'repo' : 'scratch');
    const isScratchMode = mode === 'scratch';
    
    if (!context && !isScratchMode) {
      return { error: 'No context available. Please configure your environment first.' };
    }

    const daytona = new Daytona({
      apiKey: process.env.DAYTONA_API_KEY,
      apiUrl: process.env.DAYTONA_API_URL || 'https://app.daytona.io/api',
      target: process.env.DAYTONA_TARGET as any || 'us',
    });
    const HOME = '/home/daytona';
    const opTimeout = typeof timeout === 'number' && isFinite(timeout) && timeout > 0 ? timeout : 120;

    try {
      switch (action) {
        case 'create_or_resume':
          // Prefer state.sandboxId; fallback to labels; else create
          {
            const labels = labelFilter && Object.keys(labelFilter).length ? labelFilter : buildSandboxLabels(context, vmSession);

            // 1) Try by saved sandboxId first (most precise)
            if (vmSession?.sandboxId) {
              try {
                const existing = await daytona.get(vmSession.sandboxId);
                const info = {
                  id: existing.id,
                  state: (existing as any).state || 'unknown',
                  labels: (existing as any).labels || {}
                };
                if (info.state !== 'started') {
                  await existing.start(opTimeout);
                }
                return {
                  action: 'vm_resumed',
                  sandboxId: existing.id,
                  message: `Using existing VM ${existing.id} (${info.state}) from saved session id.`,
                  status: 'active',
                  labels,
                  repoCloned: vmSession?.repoCloned || false,
                };
              } catch {}
            }

            // 2) Fallback to label-based deduplication
            let sandbox = undefined as any;
            try {
              sandbox = await daytona.findOne({ labels });
            } catch {}

            if (sandbox) {
              const info = {
                id: sandbox.id,
                state: (sandbox as any).state || 'unknown',
                labels: (sandbox as any).labels || {}
              };
              if (info.state !== 'started') {
                await sandbox.start(120);
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
              image: 'ubuntu:latest',
              envVars: {
                GITHUB_USER: context.githubUsername || 'unknown',
                TARGET_REPO: context.targetRepo || ''
              },
              labels,
              autoStopInterval: 180
            }, { timeout: opTimeout });

            return {
              action: 'vm_created',
              sandboxId: sandbox.id,
              message: `Created secure VM environment ${sandbox.id} for ${context.targetRepo}`,
              status: 'active',
              labels,
              repoCloned: false
            };
          }

        case 'clone_repo':
          {
            const labels = labelFilter && Object.keys(labelFilter).length ? labelFilter : buildSandboxLabels(context, vmSession);
            const sandbox = vmSession?.sandboxId ? await daytona.get(vmSession.sandboxId) : await (async () => {
              try { return await daytona.findOne({ labels }); } catch { return undefined; }
            })();
            if (!sandbox) return { error: 'No active VM session. Create VM first.' };

            const repoUrl = `https://github.com/${context.targetRepo}`;
            const token = (context as any).accessToken;
            const authUrl = token ? `https://${token}@${repoUrl.replace('https://', '')}` : repoUrl;
            const useBranch = branch || context.selectedBranch || 'main';
            const targetDir = `${HOME}/target`;
            const cloneCmd = (branch || context.selectedBranch)
              ? `git clone -b ${useBranch} --single-branch ${authUrl} ${targetDir}`
              : `git clone ${authUrl} ${targetDir}`;

            // Ensure target base exists and clone with a timeout in the home directory
            const full = `bash -lc "mkdir -p ${HOME} && ${cloneCmd}"`;
            const execRes = await sandbox.process.executeCommand(full, HOME, undefined, opTimeout);

            // Note: vmSession updates are handled by postModelHook

            return {
              action: 'repo_cloned',
              message: `Repository ${context.targetRepo}:${useBranch} cloned to ${targetDir}`,
              workingDirectory: targetDir,
              stdout: execRes?.artifacts?.stdout,
            };
          }

        case 'execute':
          {
            const labels = labelFilter && Object.keys(labelFilter).length ? labelFilter : buildSandboxLabels(context, vmSession);
            const sandbox = id ? await daytona.get(id) : (vmSession?.sandboxId ? await daytona.get(vmSession.sandboxId) : await (async () => {
              try { return await daytona.findOne({ labels }); } catch { return undefined; }
            })());
            if (!sandbox) return { error: 'No active VM session. Create VM first.' };
            if (!command) return { error: 'No command provided.' };
            const resolvedCwd = cwd || vmSession?.workingDirectory || HOME;
            const execRes = await sandbox.process.executeCommand(command, resolvedCwd, env, opTimeout);
            // Note: vmSession updates are handled by postModelHook
            return {
              action: 'command_executed',
              sandboxId: sandbox.id,
              stdout: execRes?.artifacts?.stdout,
            };
          }

        case 'status':
          {
            const labels = labelFilter && Object.keys(labelFilter).length ? labelFilter : buildSandboxLabels(context, vmSession);
            const sandbox = id ? await daytona.get(id) : (vmSession?.sandboxId ? await daytona.get(vmSession.sandboxId) : await (async () => {
              try { return await daytona.findOne({ labels }); } catch { return undefined; }
            })());
            if (!sandbox) return { status: 'none', message: 'No sandbox found for current context', labels };
            // TypeScript SDK: access properties directly from sandbox
            const info = { 
              id: sandbox.id, 
              state: (sandbox as any).state || 'unknown',
              labels: (sandbox as any).labels || {},
              updatedAt: (sandbox as any).updatedAt || new Date().toISOString()
            };
            return { action: 'status', sandboxId: sandbox.id, info };
          }

        case 'cleanup':
          if (!vmSession?.sandboxId) {
            return { error: 'No active VM to clean up.' };
          }

          const sandbox = await daytona.get(vmSession.sandboxId);
          await daytona.delete(sandbox);

          // Note: vmSession updates are handled by postModelHook

          return {
            action: 'vm_terminated',
            message: `VM ${vmSession.sandboxId} cleaned up successfully`
          };
          
        default:
          return { action: 'error', message: `Unknown VM action: ${action}` };
      }
    } catch (error) {
      return { action: 'error', message: `VM operation failed: ${error}` };
    }
  },
  {
    name: "manage_vm",
    description: `Manage VM environments for secure pentesting operations.

WHEN TO USE:
- 'create_or_resume': Start or resume a VM environment for the current repository
- 'clone_repo': Clone the target repository into the VM
- 'execute': Run commands in the VM environment
- 'status': Get current VM status/info
- 'cleanup': Safely terminate and clean up VM resources

REQUIRES: Active repository context (call get_context first)

WORKFLOW:
1. Call get_context to verify repository setup
2. Use create_or_resume to get VM environment
3. Use clone_repo to clone target repository
4. Use execute for running security tools
5. Use cleanup when finished`,
    schema: z.object({
      action: z.enum(['create_or_resume', 'clone_repo', 'execute', 'status', 'cleanup']).describe("VM management action"),
      id: z.string().optional().describe("Optional sandbox id"),
      labels: z.record(z.string()).optional().describe("Optional labels to find sandbox"),
      command: z.string().optional().describe("Command to execute when action = execute"),
      cwd: z.string().optional().describe("Working directory for execute"),
      env: z.record(z.string()).optional().describe("Env vars for execute"),
      branch: z.string().optional().describe("Branch to clone when action = clone_repo"),
      timeout: z.number().int().positive().optional().describe("Timeout in seconds for VM actions (default 120)")
    })
  }
);
