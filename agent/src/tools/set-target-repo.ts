import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getCurrentTaskInput, type LangGraphRunnableConfig } from "@langchain/langgraph";
import { type PentestAgentStateType } from "../state";

/**
 * Tool to set target repository for scratch mode projects
 * When user builds a project from scratch and is ready to publish,
 * they provide the target GitHub repository using this tool.
 */
export const setTargetRepoTool = tool(
  async (
    { repo, branch }: { repo: string; branch?: string },
    config: LangGraphRunnableConfig
  ) => {
    const state = getCurrentTaskInput() as PentestAgentStateType;
    
    // Validate repo format (should be owner/repo)
    const repoPattern = /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/;
    if (!repoPattern.test(repo)) {
      return {
        error: true,
        message: `Invalid repository format: "${repo}". Expected format: "username/repo-name" (e.g., "octocat/hello-world")`,
      };
    }

    const targetBranch = branch || 'main';
    
    // Store in state for GitOps subagent to use
    return {
      action: 'target_repo_set',
      targetRepo: repo,
      targetBranch,
      message: `✅ Target repository set to ${repo}:${targetBranch}. Ready to initialize git and push code.`,
      instructions: [
        `1. Navigate to project directory (/home/daytona/project)`,
        `2. Initialize git repository if not already done`,
        `3. Stage all files (git add .)`,
        `4. Create initial commit with meaningful message`,
        `5. Add remote origin: https://github.com/${repo}.git`,
        `6. Push to ${targetBranch} branch`,
        `7. Optionally create a Pull Request if needed`
      ],
      nextSteps: {
        delegateTo: 'GitOps Subagent (Repo Navigator)',
        task: `Initialize git in /home/daytona/project, commit all files, set remote to https://github.com/${repo}.git, and push to ${targetBranch}`,
      },
      // This will be picked up by GitOps subagent
      gitConfig: {
        targetRepo: repo,
        targetBranch,
        mode: 'scratch_publish',
        workingDirectory: '/home/daytona/project',
      }
    };
  },
  {
    name: "set_target_repo",
    description: `Set target GitHub repository for publishing scratch mode projects.

WHEN TO USE:
- User has built a project from scratch (scratch mode)
- Project is complete and ready to publish
- User provides GitHub repository destination

USAGE:
1. Ask user: "Please provide the GitHub repository where you'd like to push this code (format: username/repo-name)"
2. User responds with repository (e.g., "johndoe/my-awesome-app")
3. Call this tool with the repository and optional branch
4. Then delegate to GitOps subagent to initialize git and push code

IMPORTANT: This tool is ONLY for scratch mode. In repo mode, the repository is already configured.`,
    schema: z.object({
      repo: z.string().describe("Target GitHub repository in format: username/repo-name (e.g., 'octocat/hello-world')"),
      branch: z.string().optional().describe("Target branch name (default: 'main')"),
    }),
  }
);


