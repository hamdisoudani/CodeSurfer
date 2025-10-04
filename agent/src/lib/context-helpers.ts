// Shared context resolution logic for tools
export function resolveContext(state: any) {
  // With getCurrentTaskInput() and DeepAgents, context is directly in state.context
  const directContext = state?.context;
  
  // Fallback: Metadata can include repo/branch flags (from both state.metadata and callbacks.metadata)
  const meta = state?.metadata || state?.callbacks?.metadata || state?.callbacks?.inheritableMetadata;

  // Merge with precedence: direct context > metadata
  return {
    ...(meta ? {
      githubUsername: meta.user_id || meta.github_user || meta.user || undefined,
      targetRepo: meta.repo,
      selectedBranch: meta.branch,
      pentestingMode: meta.pentesting_mode,
      installationId: meta.installation_id,
      accessToken: meta.access_token,
      mode: meta.mode, // 🔥 Include mode from metadata
    } : {}),
    ...(directContext || {}),
  };
}
