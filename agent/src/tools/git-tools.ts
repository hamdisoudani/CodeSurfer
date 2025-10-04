import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getCurrentTaskInput, type LangGraphRunnableConfig } from "@langchain/langgraph";
import { Daytona, type Sandbox } from "@daytonaio/sdk";
import { resolveContext } from "../lib/context-helpers";
import { type PentestAgentStateType } from "../state";
import { getGrpcClient } from "../lib/grpc-client";

const HOME = "/home/daytona";

// Helper: build consistent Daytona labels for sandbox discovery/deduplication
function buildSandboxLabels(context: any, vmSession?: any): Record<string, string> {
  const labels: Record<string, string> = { type: "pentesting" };
  if (context?.githubUsername) labels.user = String(context.githubUsername);
  if (context?.targetRepo) labels.repo = String(context.targetRepo);
  if (vmSession?.sessionId) labels.sessionId = String(vmSession.sessionId);
  return labels;
}

// Helper function to get the sandbox instance
async function getSandbox(state: PentestAgentStateType): Promise<Sandbox | { error: string }> {
  const ctx = resolveContext(state);
  const vm = state?.vm_session;

  const daytona = new Daytona({
    apiKey: process.env.DAYTONA_API_KEY,
    apiUrl: process.env.DAYTONA_API_URL || "https://app.daytona.io/api",
  });

  let sandbox: Sandbox | undefined;
  if (vm?.sandboxId) {
    try {
      sandbox = await daytona.get(vm.sandboxId);
    } catch {
      // Ignore error if sandbox not found, we'll try to find it by labels
    }
  }

  if (!sandbox) {
    try {
      const labels = buildSandboxLabels(ctx, vm);
      sandbox = await daytona.findOne({ labels });
    } catch {
      // Ignore error
    }
  }

  if (!sandbox) {
    return { error: "No active VM. Create/resume first." };
  }
  return sandbox;
}


export const gitGetCurrentBranchTool = tool(
  async ({ repoPath }: { repoPath: string }, config: LangGraphRunnableConfig) => {
    const state = getCurrentTaskInput() as PentestAgentStateType;
    const sandbox = await getSandbox(state);
    if ("error" in sandbox) return sandbox;

    const result = await sandbox.process.executeCommand("git rev-parse --abbrev-ref HEAD | cat", repoPath);
    const stdout = result?.artifacts?.stdout || "";
    const exit = (result as any)?.exitCode ?? 0;
    if (exit !== 0) {
      return { error: "Failed to get current branch", details: stdout };
    }
    return { branch: stdout.trim() };
  },
  {
    name: "git_get_current_branch",
    description: "Gets the current active Git branch in the VM.",
    schema: z.object({
      repoPath: z.string().describe("Absolute path to the Git repository in the VM"),
    }),
  }
);

export const gitCreateBranchTool = tool(
  async ({ branchName, repoPath }: { branchName: string; repoPath: string }, config: LangGraphRunnableConfig) => {
    const state = getCurrentTaskInput() as PentestAgentStateType;
    const sandbox = await getSandbox(state);
    if ("error" in sandbox) return sandbox;

    const result = await sandbox.process.executeCommand(`git switch -c "${branchName}"`, repoPath);
    const exit = (result as any)?.exitCode ?? 0;
    if (exit !== 0) {
      return { error: `Failed to create branch '${branchName}'`, details: result?.artifacts?.stdout || '' };
    }
    return { status: "success", branch: branchName };
  },
  {
    name: "git_create_branch",
    description: "Creates and switches to a new Git branch in the VM.",
    schema: z.object({
      branchName: z.string().describe("The name of the new branch to create."),
      repoPath: z.string().describe("Absolute path to the Git repository in the VM"),
    }),
  }
);

export const gitSwitchBranchTool = tool(
  async ({ branchName, repoPath }: { branchName: string; repoPath: string }, config: LangGraphRunnableConfig) => {
    const state = getCurrentTaskInput() as PentestAgentStateType;
    const sandbox = await getSandbox(state);
    if ("error" in sandbox) return sandbox;

    const result = await sandbox.process.executeCommand(`git switch "${branchName}"`, repoPath);
    const exit = (result as any)?.exitCode ?? 0;
    if (exit !== 0) {
      return { error: `Failed to switch to branch '${branchName}'`, details: result?.artifacts?.stdout || '' };
    }
    return { status: "success", branch: branchName };
  },
  {
    name: "git_switch_branch",
    description: "Switches to an existing Git branch in the VM.",
    schema: z.object({
      branchName: z.string().describe("The name of the branch to switch to."),
      repoPath: z.string().describe("Absolute path to the Git repository in the VM"),
    }),
  }
);

export const gitListCommitsTool = tool(
  async ({ limit = 10, repoPath }: { limit?: number; repoPath: string }, config: LangGraphRunnableConfig) => {
    const state = getCurrentTaskInput() as PentestAgentStateType;
    const sandbox = await getSandbox(state);
    if ("error" in sandbox) return sandbox;

    const result = await sandbox.process.executeCommand(`git log --oneline -n ${limit} | cat`, repoPath);
    const exit = (result as any)?.exitCode ?? 0;
    const stdout = result?.artifacts?.stdout || "";
    if (exit !== 0) {
      return { error: "Failed to list commits", details: stdout };
    }
    return { commits: stdout.trim().split('\n') };
  },
  {
    name: "git_list_commits",
    description: "Lists the most recent commits in the current branch.",
    schema: z.object({
      limit: z.number().optional().default(10).describe("The maximum number of commits to return."),
      repoPath: z.string().describe("Absolute path to the Git repository in the VM"),
    }),
  }
);

export const gitCommitTool = tool(
  async ({ message, authorName, authorEmail, repoPath }: { message: string, authorName: string, authorEmail: string, repoPath: string }, config: LangGraphRunnableConfig) => {
    const state = getCurrentTaskInput() as PentestAgentStateType;
    const sandbox = await getSandbox(state);
    if ("error" in sandbox) return sandbox;
    
    // Configure git identity for this commit
    const configCmd = `git config user.name "${authorName}" && git config user.email "${authorEmail}"`;
    const configResult = await sandbox.process.executeCommand(configCmd, repoPath);
    if (((configResult as any)?.exitCode ?? 0) !== 0) {
      return { error: "Failed to set git author identity", details: configResult?.artifacts?.stdout || '' };
    }

    const commitCmd = `git add -A && git commit -m "${message}"`;
    const result = await sandbox.process.executeCommand(commitCmd, repoPath);
    const exit = (result as any)?.exitCode ?? 0;
    const stdout = result?.artifacts?.stdout || "";
    if (exit !== 0) {
      // Check for "nothing to commit" which isn't a true error
      if (stdout.includes("nothing to commit")) {
        return { status: "success", message: "No changes to commit." };
      }
      return { error: "Failed to commit changes", details: stdout };
    }
    return { status: "success", message: "Changes committed." };
  },
  {
    name: "git_commit",
    description: "Stages all changes and creates a commit with a given message and author details.",
    schema: z.object({
      message: z.string().describe("The commit message."),
      authorName: z.string().describe("The name of the author to use for the commit."),
      authorEmail: z.string().describe("The email of the author to use for the commit."),
      repoPath: z.string().describe("Absolute path to the Git repository in the VM"),
    }),
  }
);

export const gitPushBranchTool = tool(
  async ({ branchName, repoPath }: { branchName?: string; repoPath: string }, config: LangGraphRunnableConfig) => {
    const state = getCurrentTaskInput() as PentestAgentStateType;
    const sandbox = await getSandbox(state);
    if ("error" in sandbox) return sandbox;

    // Determine branch
    let targetBranch = branchName;
    if (!targetBranch) {
      const res = await sandbox.process.executeCommand("git rev-parse --abbrev-ref HEAD | cat", repoPath);
      targetBranch = (res?.artifacts?.stdout || '').trim();
    }
    if (!targetBranch) return { error: "Failed to resolve branch for push" };

    // Fetch token from backend via gRPC
    const grpc = getGrpcClient();
    const installationId = state?.context?.installationId || "";
    const repo = state?.context?.targetRepo || "";
    const workspaceId = (state as any)?.context?.workspaceId || undefined;
    const tokenInfo = await grpc.getGitHubToken(String(installationId), workspaceId, repo);
    if (!tokenInfo?.token) return { error: "Failed to obtain GitHub token from backend" };

    // Get current remote URL to extract owner/repo
    const remoteUrlRes = await sandbox.process.executeCommand("git remote get-url origin | cat", repoPath);
    const remoteUrl = (remoteUrlRes?.artifacts?.stdout || '').trim();
    if (!remoteUrl) return { error: "Failed to get remote origin URL" };

    // Extract owner/repo from remote URL (handles both https and ssh formats)
    let ownerRepo: string;
    if (remoteUrl.startsWith('https://')) {
      // https://github.com/owner/repo.git or https://github.com/owner/repo
      const match = remoteUrl.match(/github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?$/);
      if (!match) return { error: "Invalid GitHub remote URL format" };
      ownerRepo = `${match[1]}/${match[2]}`;
    } else if (remoteUrl.startsWith('git@')) {
      // git@github.com:owner/repo.git
      const match = remoteUrl.match(/github\.com:([^\/]+)\/([^\/]+?)(?:\.git)?$/);
      if (!match) return { error: "Invalid GitHub remote URL format" };
      ownerRepo = `${match[1]}/${match[2]}`;
    } else {
      return { error: "Unsupported remote URL format" };
    }

    // Set remote URL with installation token and push
    const authUrl = `https://x-access-token:${tokenInfo.token}@github.com/${ownerRepo}.git`;
    const setRemoteCmd = `git remote set-url origin "${authUrl}"`;
    const setRemoteRes = await sandbox.process.executeCommand(setRemoteCmd, repoPath);
    if (((setRemoteRes as any)?.exitCode ?? 0) !== 0) {
      return { error: "Failed to set remote URL with token", details: setRemoteRes?.artifacts?.stdout || '' };
    }

    const pushCmd = `git push -u origin ${targetBranch}`;
    const result = await sandbox.process.executeCommand(pushCmd, repoPath, undefined, 120);
    const exit = (result as any)?.exitCode ?? 0;
    const stdout = result?.artifacts?.stdout || '';
    if (exit !== 0) {
      return { error: "Failed to push branch", details: stdout };
    }
    return { status: "success", branch: targetBranch };
  },
  {
    name: "git_push_branch",
    description: "Pushes the current or specified branch to origin using GitHub App installation token in remote URL.",
    schema: z.object({
      branchName: z.string().optional().describe("Branch to push. Defaults to current branch."),
      repoPath: z.string().describe("Absolute path to the Git repository in the VM"),
    }),
  }
);

export const githubCreatePRTool = tool(
  async ({ head, base, title, body, repoPath }: { head?: string; base: string; title: string; body?: string; repoPath: string }, config: LangGraphRunnableConfig) => {
    const state = getCurrentTaskInput() as PentestAgentStateType;
    const sandbox = await getSandbox(state);
    if ("error" in sandbox) return sandbox;

    // Determine head branch if not provided
    let headBranch = head;
    if (!headBranch) {
      const res = await sandbox.process.executeCommand("git rev-parse --abbrev-ref HEAD | cat", repoPath);
      headBranch = (res?.artifacts?.stdout || '').trim();
    }
    if (!headBranch) return { error: "Failed to resolve head branch for PR" };

    const repoFull = state?.context?.targetRepo || ""; // owner/repo
    if (!repoFull.includes('/')) return { error: "Missing or invalid repo in context (expected owner/repo)" };
    const [owner, repo] = repoFull.split('/');

    // Fetch token via gRPC
    const grpc = getGrpcClient();
    const installationId = state?.context?.installationId || "";
    const workspaceId = (state as any)?.context?.workspaceId || undefined;
    const tokenInfo = await grpc.getGitHubToken(String(installationId), workspaceId, repoFull);
    if (!tokenInfo?.token) return { error: "Failed to obtain GitHub token from backend" };

    // Create PR via curl in VM to avoid exposing token in agent logs
    const prTitle = title.replace(/"/g, '\\"');
    const prBody = (body || '').replace(/"/g, '\\"');
    const payload = `'{"title":"${prTitle}","head":"${headBranch}","base":"${base}","body":"${prBody}"}'`;
    const curlCmd = `curl -s -X POST -H \"Accept: application/vnd.github+json\" -H \"Authorization: Bearer ${tokenInfo.token}\" https://api.github.com/repos/${owner}/${repo}/pulls -d ${payload}`;
    const prRes = await sandbox.process.executeCommand(curlCmd, repoPath, undefined, 120);
    const stdout = prRes?.artifacts?.stdout || '';
    // Very light parsing without bringing a JSON parser into the VM shell
    const urlMatch = stdout.match(/"html_url"\s*:\s*"([^"]+)"/);
    const numberMatch = stdout.match(/"number"\s*:\s*(\d+)/);
    if (!urlMatch) {
      return { error: "Failed to create PR", details: stdout.substring(0, 500) };
    }
    return { status: "success", url: urlMatch[1], prNumber: numberMatch ? Number(numberMatch[1]) : undefined };
  },
  {
    name: "github_create_pr",
    description: "Creates a GitHub pull request using a token fetched from the backend via gRPC.",
    schema: z.object({
      head: z.string().optional().describe("Head branch (defaults to current branch)"),
      base: z.string().describe("Base branch to merge into, e.g., main"),
      title: z.string().describe("Pull request title"),
      body: z.string().optional().describe("Pull request description"),
      repoPath: z.string().describe("Absolute path to the Git repository in the VM"),
    }),
  }
);
