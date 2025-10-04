// Utilities for parsing tool messages and computing state updates

type AnyRecord = Record<string, any>;

export const TARGET_TOOLS = new Set([
  'get_context',
  'manage_vm',
  'create_resume_vm',
  'get_vm_status',
  'cleanup_vm',
  'clone_repo_vm',
  'exec_shell_vm',
  'kill_background_process',
  'check_process_status',
  'list_background_processes',
  'vm_ls',
  'vm_read_file',
  'vm_write_file'
]);

export function isToolMessage(message: any): boolean {
  if (!message) return false;
  const role = message?.role ?? message?.type;
  return role === 'tool';
}

export function extractToolName(message: any): string | undefined {
  return (
    message?.name ||
    message?.additional_kwargs?.name ||
    message?.additional_kwargs?.tool_name
  );
}

export function parseContentToJson(content: any): AnyRecord | undefined {
  if (!content) return undefined;
  if (typeof content === 'string') {
    try { return JSON.parse(content); } catch { return undefined; }
  }
  if (Array.isArray(content)) {
    for (const c of content) {
      if (typeof c === 'string') { try { return JSON.parse(c); } catch {} }
      else if (c?.text) { try { return JSON.parse(c.text); } catch {} }
    }
    return undefined;
  }
  if (typeof content === 'object') return content as AnyRecord;
  return undefined;
}

export function getLatestRelevantToolPayload(messages: any[]): { toolName: string; payload: AnyRecord } | undefined {
  if (!Array.isArray(messages) || messages.length === 0) return undefined;

  // Fast path: last element check
  const last = messages[messages.length - 1] ?? messages.at?.(-1);
  if (isToolMessage(last)) {
    const tool = extractToolName(last);
    if (tool && TARGET_TOOLS.has(tool)) {
      const payload = parseContentToJson(last?.content);
      if (payload && typeof payload === 'object') return { toolName: tool, payload };
    }
  }

  // Fallback: reverse scan for latest relevant tool message
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!isToolMessage(m)) continue;
    const tool = extractToolName(m);
    if (!tool || !TARGET_TOOLS.has(tool)) continue;
    const payload = parseContentToJson(m?.content);
    if (payload && typeof payload === 'object') return { toolName: tool, payload };
  }
  return undefined;
}

// Coerce the latest tool message's content to a string, if needed
export function coerceLatestToolMessageContent(messages: any[]): { id: string; content: string } | undefined {
  if (!Array.isArray(messages) || messages.length === 0) return undefined;
  // Fast path: last element
  const last = messages[messages.length - 1] ?? messages.at?.(-1);
  const trySanitize = (m: any) => {
    if (!isToolMessage(m)) return undefined;
    const content = m?.content;
    if (typeof content === 'string') return undefined;
    const json = JSON.stringify(content ?? null);
    const id = m?.id || m?.uuid || undefined;
    if (!id) return undefined;
    return { id, content: json };
  };
  const fast = trySanitize(last);
  if (fast) return fast;

  for (let i = messages.length - 1; i >= 0; i--) {
    const upd = trySanitize(messages[i]);
    if (upd) return upd;
  }
  return undefined;
}

export function computeStateUpdates(toolName: string, payload: AnyRecord, state: AnyRecord): AnyRecord | undefined {
  const out: AnyRecord = {};

  // Context update from get_context
  if (toolName === 'get_context') {
    const ctx = payload?.context || {};
    if (ctx && (ctx.githubUsername || ctx.installationId || ctx.targetRepo || ctx.selectedBranch || typeof ctx.pentestingMode === 'boolean')) {
      out.context = {
        ...(state?.context || {}),
        ...(ctx.githubUsername !== undefined ? { githubUsername: ctx.githubUsername } : {}),
        ...(ctx.installationId !== undefined ? { installationId: ctx.installationId } : {}),
        ...(ctx.targetRepo !== undefined ? { targetRepo: ctx.targetRepo } : {}),
        ...(ctx.selectedBranch !== undefined ? { selectedBranch: ctx.selectedBranch } : {}),
        ...(typeof ctx.pentestingMode === 'boolean' ? { pentestingMode: ctx.pentestingMode } : {}),
      };
    }
    const vm = payload?.context?.vm;
    if (vm && typeof vm === 'object') {
      out.vm_session = {
        ...(state?.vm_session || {}),
        ...(vm.sandboxId ? { sandboxId: vm.sandboxId } : {}),
        ...(vm.vmStatus ? { vmStatus: vm.vmStatus } : {}),
        ...(typeof vm.repoCloned === 'boolean' ? { repoCloned: !!vm.repoCloned } : {}),
        ...(vm.workingDirectory ? { workingDirectory: vm.workingDirectory } : {}),
        ...(vm.lastUsed ? { lastUsed: vm.lastUsed } : {}),
        ...(vm.createdAt ? { createdAt: vm.createdAt } : {}),
      };
    }
  }

  // VM lifecycle and process updates
  const action = payload.action || payload.status;
  const vmSession = state?.vm_session;
  const vmUpdate: AnyRecord = { lastUsed: new Date().toISOString() };
  let shouldUpdateVM = false;

  if (payload.sandboxId) { vmUpdate.sandboxId = payload.sandboxId; shouldUpdateVM = true; }

  if (action === 'vm_created') {
    vmUpdate.vmStatus = 'active';
    vmUpdate.createdAt = new Date().toISOString();
    vmUpdate.repoCloned = typeof payload.repoCloned === 'boolean' ? !!payload.repoCloned : false;
    shouldUpdateVM = true;
  } else if (action === 'vm_resumed') {
    vmUpdate.vmStatus = 'active';
    if (typeof payload.repoCloned === 'boolean') vmUpdate.repoCloned = !!payload.repoCloned;
    shouldUpdateVM = true;
  } else if (action === 'repo_cloned') {
    vmUpdate.repoCloned = true;
    if (payload.workingDirectory) vmUpdate.workingDirectory = payload.workingDirectory;
    shouldUpdateVM = true;
  } else if (action === 'vm_terminated') {
    vmUpdate.vmStatus = 'terminated';
    vmUpdate.workingDirectory = undefined;
    vmUpdate.repoCloned = false;
    shouldUpdateVM = true;
  } else if (action === 'command_started') {
    if (payload.pid && (payload.sandboxId || vmSession?.sandboxId)) {
      const existingProcesses = vmSession?.backgroundProcesses || [];
      const newProcess = {
        pid: String(payload.pid),
        command: payload.command || 'unknown',
        startedAt: new Date().toISOString(),
        cwd: payload.cwd,
        logFile: payload.logFile,
        status: 'running' as const
      };
      vmUpdate.backgroundProcesses = [...existingProcesses, newProcess];
      shouldUpdateVM = true;
    }
  } else if (action === 'process_killed') {
    if (payload.pid && vmSession?.backgroundProcesses) {
      const updated = vmSession.backgroundProcesses.map((p: any) =>
        String(p.pid) === String(payload.pid) ? { ...p, status: 'killed' as const } : p
      );
      vmUpdate.backgroundProcesses = updated;
      shouldUpdateVM = true;
    }
  } else if (action === 'process_status') {
    if (payload.pid && vmSession?.backgroundProcesses) {
      const updated = vmSession.backgroundProcesses.map((p: any) => {
        if (String(p.pid) !== String(payload.pid)) return p;
        return { ...p, status: payload.isRunning ? 'running' as const : 'completed' as const };
      });
      vmUpdate.backgroundProcesses = updated;
      shouldUpdateVM = true;
    }
  } else if (action === 'process_list') {
    const procs = Array.isArray(payload.processes) ? payload.processes : [];
    if (procs.length) {
      const existing = vmSession?.backgroundProcesses || [];
      const byPid: Record<string, any> = Object.create(null);
      for (const p of existing) byPid[String(p.pid)] = p;
      for (const p of procs) {
        const pid = String(p.pid);
        byPid[pid] = { ...byPid[pid], ...p, pid };
      }
      vmUpdate.backgroundProcesses = Object.values(byPid);
      shouldUpdateVM = true;
    }
  } else if (action === 'status') {
    const info = payload.info || {};
    const st = String(info.state || '').toLowerCase();
    if (st.includes('start')) vmUpdate.vmStatus = 'active';
    else if (st.includes('stop')) vmUpdate.vmStatus = 'suspended';
    else if (st.includes('terminat') || st.includes('dead')) vmUpdate.vmStatus = 'terminated';
    else if (!st) vmUpdate.vmStatus = (state?.vm_session?.vmStatus as any) || 'none';
    if (!vmUpdate.sandboxId && info.id) vmUpdate.sandboxId = info.id;
    shouldUpdateVM = true;
  }

  if (shouldUpdateVM) {
    out.vm_session = { ...(out.vm_session || state?.vm_session || {}), ...vmUpdate };
  }

  return Object.keys(out).length ? out : undefined;
}


