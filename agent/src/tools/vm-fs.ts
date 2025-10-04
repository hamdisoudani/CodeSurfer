import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { Daytona } from "@daytonaio/sdk";
import { getCurrentTaskInput, type LangGraphRunnableConfig } from "@langchain/langgraph";
import { resolveContext } from "../lib/context-helpers";
import { type PentestAgentStateType } from "../state";

const HOME = "/home/daytona";

function buildSandboxLabels(context: any, vmSession?: any): Record<string, string> {
  const labels: Record<string, string> = { type: "pentesting" };
  if (context?.githubUsername) labels.user = String(context.githubUsername);
  if (context?.targetRepo) labels.repo = String(context.targetRepo);
  if (vmSession?.sessionId) labels.sessionId = String(vmSession.sessionId);
  return labels;
}

async function resolveSandbox(state: PentestAgentStateType) {
  const ctx = resolveContext(state);
  // With getCurrentTaskInput() and DeepAgents, vm_session is directly in state
  const vm = state?.vm_session;

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
  return { sandbox, targetSandboxId, ctx, vm };
}

// NOTE: Previously contained vmGlob, vmGrep, vmReadJson, vmWriteJson, and vmStackFingerprint tools
// These were removed due to command escaping issues. Use exec_shell_vm instead with proper shell commands.
// Examples: exec_shell_vm(command: "find . -name '*.js' | head -10") or exec_shell_vm(command: "grep -r 'pattern' .")

export const vmMkdirPTool = tool(
  async ({ path }: { path: string }, config: LangGraphRunnableConfig) => {
    // Access the current graph state using getCurrentTaskInput()
    const state = getCurrentTaskInput() as PentestAgentStateType;
    const resolved = await resolveSandbox(state);
    if ((resolved as any).error) return resolved;
    const { sandbox } = resolved as any;
    if (!path || path.includes("..")) return { error: "Invalid path" };
    const cmd = `mkdir -p "${path}"`;
    await sandbox.process.executeCommand(cmd, HOME, undefined, 30);
    return { action: "vm_mkdir_p", path };
  },
  {
    name: "vm_mkdir_p",
    description: "Create a directory recursively in the VM (mkdir -p).",
    schema: z.object({ path: z.string().describe("Directory path to create") })
  }
);




