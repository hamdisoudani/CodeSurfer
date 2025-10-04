import {
  isToolMessage,
  isAIMessage,
  type BaseMessage,
  type ToolMessage,
  type AIMessage
} from "@langchain/core/messages";

import { type PentestAgentStateType } from "../state";

export function createPentestPostModelHook() {
  return async function postModelHook(
    state: any, // Use any to work with DeepAgent's expected signature
  ): Promise<any> {
    try {
      const messages = state.messages;
      if (!messages.length) return state;

      // Debug: Log recent messages to understand the flow
      const lastTwoMessages = messages.slice(-2);
      console.log('🔍 PostModel Hook - Processing messages:', lastTwoMessages.map((m: any) => ({
        type: m._getType(),
        content: typeof m.content === 'string' ? m.content.slice(0, 100) + '...' : m.content,
        tool_calls: m.tool_calls?.length || 0,
        tool_call_id: m.tool_call_id
      })));

      // Look for completed tool calls by finding ToolMessage that follows an AIMessage with tool_calls
      // Based on LangChain docs: ToolMessage must follow AIMessage with matching tool_call_id
      const stateUpdates: any = {};

      // Find the most recent ToolMessage and its corresponding AIMessage
      for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i];
        
        if (isToolMessage(message)) {
          const toolMessage = message as ToolMessage;
          
          // Find the corresponding AIMessage that made this tool call
          const correspondingAIMessage = findCorrespondingAIMessage(messages, toolMessage.tool_call_id, i);
          
          if (correspondingAIMessage) {
            const toolName = correspondingAIMessage.tool_calls?.find(tc => tc.id === toolMessage.tool_call_id)?.name;
            
            if (toolName) {
              console.log(`🛠️ Processing tool result for: ${toolName}`, {
                toolCallId: toolMessage.tool_call_id,
                content: typeof toolMessage.content === 'string' ? toolMessage.content.slice(0, 200) + '...' : toolMessage.content
              });
              
              const updates = computeStateUpdatesFromToolResult(toolName, toolMessage, state);
              if (updates) {
                console.log(`✅ State updates computed for ${toolName}:`, updates);
                // Merge without overwriting fields already set by newer messages
                if (updates.vm_session) {
                  const target = stateUpdates.vm_session || {};
                  const source = updates.vm_session;
                  for (const key of Object.keys(source)) {
                    if (typeof target[key] === 'undefined') {
                      (target as any)[key] = (source as any)[key];
                    }
                  }
                  stateUpdates.vm_session = target;
                }
                // Merge any other top-level fields conservatively
                for (const key of Object.keys(updates)) {
                  if (key === 'vm_session') continue;
                  if (typeof (stateUpdates as any)[key] === 'undefined') {
                    (stateUpdates as any)[key] = (updates as any)[key];
                  }
                }
              } else {
                console.log(`⚠️ No state updates for ${toolName}`);
              }
            }
          }
        }
      }

      return Object.keys(stateUpdates).length > 0 ? stateUpdates : state;
    } catch (error) {
      console.error("Error in postModelHook", error);
      return state;
    }
  };
}

/**
 * Find the AIMessage that corresponds to a ToolMessage by tool_call_id
 * Searches backwards from the ToolMessage position to find the AIMessage with matching tool call
 */
function findCorrespondingAIMessage(
  messages: BaseMessage[], 
  toolCallId: string, 
  toolMessageIndex: number
): AIMessage | null {
  // Search backwards from the tool message to find the AIMessage with this tool_call_id
  for (let i = toolMessageIndex - 1; i >= 0; i--) {
    const message = messages[i];
    if (isAIMessage(message)) {
      const aiMessage = message as AIMessage;
      if (aiMessage.tool_calls?.some(tc => tc.id === toolCallId)) {
        return aiMessage;
      }
    }
  }
  return null;
}

/**
 * Compute state updates based on tool results
 * This function handles specific tools and updates the appropriate state fields
 */
function computeStateUpdatesFromToolResult(
  toolName: string,
  toolMessage: ToolMessage,
  currentState: any
): any | null {
  try {
    // Parse tool result content
    let toolResult: any;
    try {
      if (typeof toolMessage.content === 'string') {
        // Handle both JSON strings and plain error strings
        if (toolMessage.content.trim().startsWith('{') || toolMessage.content.trim().startsWith('[')) {
          toolResult = JSON.parse(toolMessage.content);
        } else {
          // Plain string content, likely an error message
          toolResult = { 
            error: toolMessage.content,
            success: false 
          };
        }
      } else {
        toolResult = toolMessage.content;
      }
    } catch (parseError) {
      // If JSON parsing fails, treat as string result
      toolResult = { 
        result: toolMessage.content,
        error: typeof toolMessage.content === 'string' ? toolMessage.content : 'Unknown error'
      };
    }

    // Prefer explicit action-based handling when available, regardless of tool name
    if (toolResult && typeof toolResult === 'object' && typeof toolResult.action === 'string') {
      const action = String(toolResult.action);
      switch (action) {
        case 'vm_created':
        case 'vm_resumed':
          return handleVMCreateResumeResult(toolResult, currentState);
        case 'vm_terminated':
          return handleVMCleanupResult(toolResult, currentState);
        case 'repo_cloned':
        case 'repo_clone_failed':
          return handleCloneRepoResult(toolResult, currentState);
        case 'status':
          return handleVMStatusResult(toolResult, currentState);
        case 'command_executed':
        case 'command_started':
          return handleVMCommandResult(toolResult, currentState);
        case 'error':
          // Fall through to generic error-aware handling below
          break;
        default:
          // Unknown action - fall back to tool name
          break;
      }
    }

    // Fallback: route by tool name when action is missing
    switch (toolName) {
      case 'create_resume_vm':
      case 'manage_vm': // may also produce vm_* actions
        return handleVMCreateResumeResult(toolResult, currentState) 
          || handleVMCleanupResult(toolResult, currentState) 
          || handleCloneRepoResult(toolResult, currentState) 
          || handleVMStatusResult(toolResult, currentState) 
          || handleVMCommandResult(toolResult, currentState);

      case 'cleanup_vm':
        return handleVMCleanupResult(toolResult, currentState);

      case 'clone_repo_vm':
        return handleCloneRepoResult(toolResult, currentState);

      case 'get_vm_status':
        return handleVMStatusResult(toolResult, currentState);

      case 'exec_shell_vm':
        return handleVMCommandResult(toolResult, currentState);

      case 'get_context':
        return handleGetContextResult(toolResult, currentState);

      // Add more tool handlers as needed
      default:
        return null;
    }
  } catch (error) {
    console.error(`Error processing tool result for ${toolName}:`, error);
    return null;
  }
}

/**
 * Handle VM create/resume tool results
 */
function handleVMCreateResumeResult(
  toolResult: any,
  currentState: any
): any | null {
  if (toolResult.action === 'vm_created' || toolResult.action === 'vm_resumed') {
    const vmUpdate = {
      vm_session: {
        ...currentState.vm_session,
        sandboxId: toolResult.sandboxId,
        vmStatus: toolResult.status || 'active',
        repoCloned: toolResult.repoCloned || false,
        workingDirectory: toolResult.workingDirectory || currentState.vm_session?.workingDirectory,
        labels: toolResult.labels || currentState.vm_session?.labels,
        lastUsed: new Date().toISOString(),
        ...(toolResult.action === 'vm_created' && { createdAt: new Date().toISOString() })
      }
    };
    
    console.log('VM create/resume state updated:', vmUpdate);
    return vmUpdate;
  }
  return null;
}

/**
 * Handle clone repository tool results
 */
function handleCloneRepoResult(
  toolResult: any,
  currentState: any
): any | null {
  if (toolResult.action === 'repo_cloned') {
    const vmUpdate = {
      vm_session: {
        ...currentState.vm_session,
        repoCloned: true,
        workingDirectory: toolResult.path || toolResult.workingDirectory,
        repoUrl: toolResult.repoUrl || currentState.vm_session?.repoUrl,
        branch: toolResult.branch || currentState.vm_session?.branch,
        lastUsed: new Date().toISOString()
      }
    };
    
    console.log('Repo clone state updated:', vmUpdate);
    return vmUpdate;
  }
  
  // Handle clone errors
  if (toolResult.error && toolResult.action === 'repo_clone_failed') {
    const vmUpdate = {
      vm_session: {
        ...currentState.vm_session,
        repoCloned: false,
        lastUsed: new Date().toISOString()
      }
    };
    
    console.log('Repo clone failed:', vmUpdate);
    return vmUpdate;
  }
  
  return null;
}

/**
 * Handle VM status tool results
 */
function handleVMStatusResult(
  toolResult: any,
  currentState: any
): any | null {
  if (toolResult.status) {
    const vmUpdate = {
      vm_session: {
        ...currentState.vm_session,
        vmStatus: toolResult.status,
        lastUsed: new Date().toISOString()
      }
    };
    
    console.log('VM status updated:', vmUpdate);
    return vmUpdate;
  }
  return null;
}

/**
 * Handle VM cleanup/termination tool results
 */
function handleVMCleanupResult(
  toolResult: any,
  currentState: any
): any | null {
  if (toolResult.action === 'vm_terminated') {
    const vmUpdate = {
      vm_session: {
        ...currentState.vm_session,
        sandboxId: null,
        vmStatus: 'terminated',
        repoCloned: false,
        workingDirectory: null,
        lastUsed: new Date().toISOString(),
        terminatedAt: new Date().toISOString()
      }
    };
    
    console.log('VM cleanup state updated:', vmUpdate);
    return vmUpdate;
  }
  return null;
}

/**
 * Handle VM command execution results and errors
 */
function handleVMCommandResult(
  toolResult: any,
  currentState: any
): any | null {
  // Check if command failed due to VM not running
  if (toolResult.error && toolResult.error.includes('Sandbox is not running')) {
    const vmUpdate = {
      vm_session: {
        ...currentState.vm_session,
        vmStatus: 'stopped',
        lastUsed: new Date().toISOString()
      }
    };
    
    console.log('VM command error - VM stopped:', vmUpdate);
    return vmUpdate;
  }
  
  // For successful commands, just update last used time
  if (toolResult.success !== false && !toolResult.error) {
    const vmUpdate = {
      vm_session: {
        ...currentState.vm_session,
        vmStatus: 'active',
        lastUsed: new Date().toISOString()
      }
    };
    
    return vmUpdate;
  }
  
  return null;
}

/**
 * Handle get_context tool results - store mode in state for easy access by other tools
 */
function handleGetContextResult(
  toolResult: any,
  currentState: any
): any | null {
  // Extract mode from context result
  if (toolResult.mode && toolResult.context) {
    const stateUpdate = {
      context: {
        ...currentState.context,
        mode: toolResult.mode, // Store mode in state.context for easy access
      }
    };
    
    console.log(`✅ Stored mode '${toolResult.mode}' in state from get_context tool`);
    return stateUpdate;
  }
  
  return null;
}
