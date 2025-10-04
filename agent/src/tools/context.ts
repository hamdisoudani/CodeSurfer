import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {
  getCurrentTaskInput,
  type LangGraphRunnableConfig,
} from "@langchain/langgraph";
import { resolveContext } from "../lib/context-helpers";
import { type PentestAgentStateType } from "../state";
import { type UserInfo } from "../auth"; // Import UserInfo

// Simple Context Access Tool - Agent can easily get current context
export const getContextTool = tool(
  async (_input: {}, config: LangGraphRunnableConfig) => {
    // Preferred source: authenticated user context from auth middleware (in configurable)
    const configurable = (config as any)?.configurable ?? {};
    const user = (configurable?.langgraph_auth_user as UserInfo | undefined) ?? undefined;

    // Fallback/general source: graph state merged with metadata
    const state = getCurrentTaskInput() as PentestAgentStateType;
    const merged = resolveContext(state);

    // 🔥 DETECT MODE FIRST: Check state context, merged, then infer from repo presence
    const mode = state?.context?.mode || merged.mode || (user?.workspaceContext?.repo || merged.targetRepo ? 'repo' : 'scratch');
    const isScratchMode = mode === 'scratch';

    // Common fields for both modes
    const username = user?.username ?? merged.githubUsername ?? null;
    const hasAccessToken = !!merged.accessToken;
    const installationId = user?.workspaceContext?.installationId ?? merged.installationId ?? null;

    // derive VM info from state.vm_session if present
    const vm = (state as any)?.vm_session || {};
    const vmInfo = Object.keys(vm).length
      ? {
          sandboxId: vm.sandboxId || null,
          vmStatus: vm.vmStatus || null,
          repoCloned: !!vm.repoCloned,
          workingDirectory: vm.workingDirectory || null,
          lastUsed: vm.lastUsed || null,
          createdAt: vm.createdAt || null,
        }
      : null;

    // 🔥 SCRATCH MODE: Building from scratch, no repo cloned
    if (isScratchMode) {
      return {
        hasContext: true,
        mode: 'scratch',
        context: {
          // Core fields
          mode: 'scratch',
          username,
          installationId, // May be needed for creating repos later
          hasAccessToken,
          
          // VM info
          vm: vmInfo,
          workingDirectory: vm?.workingDirectory || '/home/daytona/project',
          
          // No repo-specific fields in scratch mode (cleaner response)
        },
        message: `🎨 SCRATCH MODE: Building project from scratch. No repository cloned. Working directory: ${vm?.workingDirectory || '/home/daytona/project'}. User will provide target repository later for publishing code.`,
        summary: {
          mode: 'scratch',
          workingDir: vm?.workingDirectory || '/home/daytona/project',
          note: 'Ask user for target repo when ready to publish'
        },
        instructions: [
          '1. Create files in working directory',
          '2. Build complete project from user requirements',
          '3. Run builds, tests, and quality checks',
          '4. When ready, ask user for target GitHub repository',
          '5. Use set_target_repo tool to configure destination',
          '6. Then use GitOps tools to push code'
        ]
      };
    }

    // 🔥 REPO MODE: Working with existing repository
    // Only derive repo-specific fields when in repo mode
    const repo = user?.workspaceContext?.repo ?? merged.targetRepo ?? null;
    const branch = user?.workspaceContext?.branch ?? merged.selectedBranch ?? null;
    const workspaceIdHeader =
      configurable["x-workspace-id"] ||
      configurable["workspace-id"] ||
      configurable["x-workspace"] ||
      undefined;
    const workspaceId = user?.workspaceId ?? workspaceIdHeader ?? null;
    
    const indexStatus = user?.workspaceContext?.indexStatus ?? null;
    const isIndexed = user?.workspaceContext?.isIndexed ?? null;
    const lastIndexedAt = user?.workspaceContext?.lastIndexedAt ?? null;
    const lastCommitSha = user?.workspaceContext?.lastCommitSha ?? null;

    const hasContext = !!(repo || branch || username || installationId);

    if (!hasContext) {
      return {
        hasContext: false,
        message:
          "No repository context available. Please select a repository and branch in the UI.",
      };
    }

    return {
      hasContext: true,
      mode: 'repo',
      context: {
        // Mode
        mode: 'repo',
        
        // Repository fields (only in repo mode)
        repo,
        branch,
        workspaceId,
        installationId,

        // Indexing status (only relevant in repo mode)
        indexStatus,
        isIndexed,
        lastIndexedAt,
        lastCommitSha,

        // User and VM info
        username,
        vm: vmInfo,
        workingDirectory: vm?.workingDirectory || null,

        // Backward-compatible aliases
        targetRepo: repo,
        selectedBranch: branch,
        githubUsername: username,
        hasAccessToken,
      },
      message: `📁 REPO MODE: ${repo ?? "<repo>"}:${branch ?? "<branch>"}. Index status: ${indexStatus ?? "<unknown>"}.`,
      summary: {
        mode: 'repo',
        repo: `${repo}:${branch}`,
        index: indexStatus ?? undefined,
      },
    };
  },
  {
    name: "get_context",
    description: `Get current repository and indexing context (repo, branch, user, index status).
    
IMPORTANT: This tool detects the operating mode:
- SCRATCH MODE: User is building a project from scratch (no repo cloned)
- REPO MODE: User is working with an existing repository

Always call this tool first to understand the current mode and context.`,
    schema: z.object({}),
  }
);
