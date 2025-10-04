import { DeepAgentState } from "deepagents";
import { withLangGraph } from "@langchain/langgraph/zod";
import { z } from "zod";

// Reducers for state merging
function shallowMergeReducerAny(a: unknown, b: unknown) {
  const left = a as any;
  const right = b as any;
  if (left == null) return right;
  if (right == null) return left;
  return { ...left, ...right };
}

// Additional persisted approval cache type
export type ApprovedOperations = { cached_approvals: Set<string> };

// Proper state schema for pentesting agent
export const PentestAgentState = DeepAgentState.extend({
  // Context information from frontend
  context: withLangGraph(
    z.object({
        githubUsername: z.string().optional(),
        installationId: z.string().optional(),
        targetRepo: z.string().optional(),
        selectedBranch: z.string().optional(),
        accessToken: z.string().optional(),
        pentestingMode: z.boolean().optional(),
        mode: z.enum(['scratch', 'repo']).optional(), // 🔥 Operating mode
    }),
    {
      reducer: { schema: z.custom(), fn: shallowMergeReducerAny },
    }
  ),

  // VM and session management
  vm_session: withLangGraph(
    z.object({
      sessionId: z.string().optional(),
      sandboxId: z.string().optional(),
      workingDirectory: z.string().optional(),
      vmStatus: z.enum(["none","creating","active","suspended","terminated"]).optional(),
      repoCloned: z.boolean().optional(),
      lastUsed: z.string().optional(),
      createdAt: z.string().optional(),
      backgroundProcesses: z.array(z.object({
        pid: z.string(),
        command: z.string(),
        startedAt: z.string(),
        cwd: z.string().optional(),
        logFile: z.string().optional(),
        status: z.enum(["running", "completed", "failed", "killed"]).optional(),
      })).optional(),
    }),
    {
      reducer: { schema: z.custom(), fn: shallowMergeReducerAny },
    }
  ),

  // Approved operations cache
  approved_operations: withLangGraph(
    z.object({
      cached_approvals: z.set(z.string())
    }).optional(),
    {
      reducer: { schema: z.custom(), fn: (_l: any, r: any) => r },
      default: () => ({ cached_approvals: new Set<string>() })
    }
  ),
});

export type PentestAgentStateType = z.infer<typeof PentestAgentState>;
