import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { Daytona } from "@daytonaio/sdk";
import { getCurrentTaskInput, type LangGraphRunnableConfig } from "@langchain/langgraph";
import { resolveContext } from "../lib/context-helpers";
import { type PentestAgentStateType } from "../state";

const HOME = "/home/daytona";
const BASE_DIR = `${HOME}/findings`;

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

export const findingsWriteTool = tool(
  async (
    { subagent, task, data }: { subagent: string; task: string; data: unknown },
    config: LangGraphRunnableConfig
  ) => {
    // Access the current graph state using getCurrentTaskInput()
    const state = getCurrentTaskInput() as PentestAgentStateType;
    const resolved = await resolveSandbox(state);
    if ((resolved as any).error) return resolved;
    const { sandbox } = resolved as any;
    const safeAgent = subagent.replace(/[^a-zA-Z0-9_-]/g, "_");
    const safeTask = task.replace(/[^a-zA-Z0-9._-]/g, "_");
    const dir = `${BASE_DIR}/${safeAgent}`;
    const filePath = `${dir}/${safeTask}.json`;
    try {
      const jsonStr = JSON.stringify(data, null, 2).replace(/'/g, "'\"'\"'");
      const cmd = `bash -lc "mkdir -p \"${dir}\" && echo '${jsonStr}' > \"${filePath}\""`;
      await sandbox.process.executeCommand(cmd, HOME, undefined, 60);
      return { action: "findings_write", subagent: safeAgent, task: safeTask, filePath };
    } catch (e) {
      return { action: "error", message: `Failed to serialize findings for ${subagent}:${task}` };
    }
  },
  {
    name: "findings_write",
    description: "Persist findings into /home/daytona/findings/<subagent>/<task>.json in the VM.",
    schema: z.object({
      subagent: z.string().describe("Subagent name prefix (e.g., project-explorer)"),
      task: z.string().describe("Task identifier (e.g., scan-initial, map-entrypoints)"),
      data: z.any().describe("Arbitrary JSON-serializable data to persist"),
    })
  }
);

export const findingsListTool = tool(
  async ({ subagent }: { subagent?: string }, config: LangGraphRunnableConfig) => {
    // Access the current graph state using getCurrentTaskInput()
    const state = getCurrentTaskInput() as PentestAgentStateType;
    const resolved = await resolveSandbox(state);
    if ((resolved as any).error) return resolved;
    const { sandbox } = resolved as any;
    const targetDir = subagent ? `${BASE_DIR}/${subagent.replace(/[^a-zA-Z0-9_-]/g, "_")}` : BASE_DIR;
    const cmd = `bash -lc 'ls -1 \"${targetDir}\" 2>/dev/null || true'`;
    const res = await sandbox.process.executeCommand(cmd, HOME, undefined, 30);
    const items = (res?.artifacts?.stdout || "")
      .split("\n")
      .map((s: string) => s.trim())
      .filter(Boolean);
    return { action: "findings_list", baseDir: targetDir, items };
  },
  {
    name: "findings_list",
    description: "List persisted findings files. Optionally scope to a subagent directory.",
    schema: z.object({ subagent: z.string().optional() })
  }
);

export const findingsReadTool = tool(
  async ({ subagent, task }: { subagent: string; task: string }, config: LangGraphRunnableConfig) => {
    // Access the current graph state using getCurrentTaskInput()
    const state = getCurrentTaskInput() as PentestAgentStateType;
    const resolved = await resolveSandbox(state);
    if ((resolved as any).error) return resolved;
    const { sandbox } = resolved as any;
    const safeAgent = subagent.replace(/[^a-zA-Z0-9_-]/g, "_");
    const safeTask = task.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = `${BASE_DIR}/${safeAgent}/${safeTask}.json`;
    const cmd = `cat "${filePath}"`;
    const res = await sandbox.process.executeCommand(cmd, HOME, undefined, 60);
    const content = res?.artifacts?.stdout || "";
    try {
      const json = JSON.parse(content);
      return { action: "findings_read", subagent: safeAgent, task: safeTask, filePath, data: json };
    } catch (e) {
      return { action: "error", message: `Invalid JSON in findings file ${filePath}` };
    }
  },
  {
    name: "findings_read",
    description: "Read a persisted findings JSON for a subagent task.",
    schema: z.object({
      subagent: z.string(),
      task: z.string(),
    })
  }
);

export const findingsIndexTool = tool(
  async ({}: {}, config: LangGraphRunnableConfig) => {
    // Access the current graph state using getCurrentTaskInput()
    const state = getCurrentTaskInput() as PentestAgentStateType;
    const resolved = await resolveSandbox(state);
    if ((resolved as any).error) return resolved;
    const { sandbox } = resolved as any;
    const cmd = `bash -lc 'find "${BASE_DIR}" -type f -name "*.json" -printf "%TY-%Tm-%Td %TH:%TM:%TS %p\n" 2>/dev/null || true'`;
    const res = await sandbox.process.executeCommand(cmd, HOME, undefined, 60);
    const lines = (res?.artifacts?.stdout || "").split("\n").map((s: string) => s.trim()).filter(Boolean);
    const entries = lines.map((l: string) => {
      const spaceIdx = l.indexOf(" ");
      const dateStr = spaceIdx > 0 ? l.slice(0, l.lastIndexOf(" ")) : "";
      const path = spaceIdx > 0 ? l.slice(l.lastIndexOf(" ") + 1) : l;
      return { date: dateStr, path };
    });
    return { action: "findings_index", baseDir: BASE_DIR, entries };
  },
  {
    name: "findings_index",
    description: "List all findings JSON files with timestamps under the findings base directory.",
    schema: z.object({})
  }
);

export const findingsStatTool = tool(
  async ({ subagent, task }: { subagent: string; task: string }, config: LangGraphRunnableConfig) => {
    // Access the current graph state using getCurrentTaskInput()
    const state = getCurrentTaskInput() as PentestAgentStateType;
    const resolved = await resolveSandbox(state);
    if ((resolved as any).error) return resolved;
    const { sandbox } = resolved as any;
    const safeAgent = subagent.replace(/[^a-zA-Z0-9_-]/g, "_");
    const safeTask = task.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = `${BASE_DIR}/${safeAgent}/${safeTask}.json`;
    const cmd = `bash -lc 'stat -c "%s %y" "${filePath}" 2>/dev/null || true'`;
    const res = await sandbox.process.executeCommand(cmd, HOME, undefined, 20);
    const out = (res?.artifacts?.stdout || "").trim();
    if (!out) return { action: "findings_stat", exists: false, filePath };
    const sizeStr = out.split(" ")[0];
    const size = Number(sizeStr);
    return { action: "findings_stat", exists: true, filePath, size: isFinite(size) ? size : undefined, raw: out };
  },
  {
    name: "findings_stat",
    description: "Get stat info (exists, size, timestamp) for a specific findings file.",
    schema: z.object({ subagent: z.string(), task: z.string() })
  }
);

export const findingsShouldRunTool = tool(
  async (
    { subagent, task, maxAgeMinutes }: { subagent: string; task: string; maxAgeMinutes?: number },
    config: LangGraphRunnableConfig
  ) => {
    // Access the current graph state using getCurrentTaskInput()
    const state = getCurrentTaskInput() as PentestAgentStateType;
    const resolved = await resolveSandbox(state);
    if ((resolved as any).error) return resolved;
    const { sandbox } = resolved as any;
    const safeAgent = subagent.replace(/[^a-zA-Z0-9_-]/g, "_");
    const safeTask = task.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = `${BASE_DIR}/${safeAgent}/${safeTask}.json`;
    const cmd = `bash -lc 'if [ -f "${filePath}" ]; then echo "YES $(date +%s -r "${filePath}")"; else echo "NO"; fi'`;
    const res = await sandbox.process.executeCommand(cmd, HOME, undefined, 20);
    const out = (res?.artifacts?.stdout || "").trim();
    if (!out || out.startsWith("NO")) {
      return { action: "findings_should_run", shouldRun: true, reason: "No prior findings" };
    }
    const parts = out.split(" ");
    const mtime = Number(parts[1]);
    const now = Math.floor(Date.now() / 1000);
    const ageSec = isFinite(mtime) ? now - mtime : Infinity;
    const maxAgeSec = (maxAgeMinutes && maxAgeMinutes > 0) ? maxAgeMinutes * 60 : 0;
    if (maxAgeSec > 0 && ageSec <= maxAgeSec) {
      return { action: "findings_should_run", shouldRun: false, reason: `Fresh (${Math.round(ageSec/60)}m old)` };
    }
    return { action: "findings_should_run", shouldRun: true, reason: `Stale or no freshness threshold (age ${Math.round(ageSec/60)}m)` };
  },
  {
    name: "findings_should_run",
    description: "Decide whether a task should run again based on presence and freshness of prior findings.",
    schema: z.object({
      subagent: z.string(),
      task: z.string(),
      maxAgeMinutes: z.number().int().positive().optional()
    })
  }
);


