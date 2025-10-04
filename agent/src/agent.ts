import { TavilySearchResults } from "@langchain/community/tools/tavily_search";
import { createDeepAgent } from "deepagents";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { getGroqModel } from "./lib/model";
import { getPentestingInstructions } from "./instructions";
import { PentestAgentState } from "./state";
import { createPentestPostModelHook } from "./hooks/post-model";
import { 
  getContextTool,
  setTargetRepoTool,
  cloneRepoVMTool,
  execShellVMTool,
  createResumeVMTool,
  getVMStatusTool,
  cleanupVMTool,
  listBackgroundProcessesTool,
  killBackgroundProcessTool,
  checkProcessStatusTool,
  vmLsTool,
  vmReadFileTool,
  vmReadRegionsTool,
  vmWriteFileTool,
  vmMkdirPTool,
  execShellManyVMTool,
  vmRgSearchTool,
  vmBatchEditTool,
  vmReplaceInFileTool,
  vmReplaceRegexInFileTool,
  vmApplyPatchHunkTool,
  vmModifyWithDiffTool,
  queryCodebaseTool,
  gitGetCurrentBranchTool,
  gitCreateBranchTool,
  gitSwitchBranchTool,
  gitListCommitsTool,
  gitCommitTool,
  gitPushBranchTool,
  githubCreatePRTool
} from "./tools";
import { lsTool } from "./tools/ls";
import { 
  fullStackEditorSubAgent,
  securityReviewerSubAgent,
  gitOpsSubAgent
} from "./subagents";

// Create checkpointer for state persistence across sessions  
const checkpointer = new MemorySaver();

// Create the main DeepAgent using the correct TypeScript API with explicit state schema
const penTestingDeepAgent = createDeepAgent({
  model: getGroqModel(),
  stateSchema: PentestAgentState,
  postModelHook: createPentestPostModelHook(),
  // Exclude builtin `ls` (returns array) to avoid non-string content; we provide our own stringified ls tool
  // Prefer VM filesystem only for analysis artifacts; drop non-VM file ops
  builtinTools: ["write_todos"],
  tools: [
    // Context and repository
    getContextTool,
    queryCodebaseTool,
    setTargetRepoTool, // 🔥 NEW: Set target repo for scratch mode

    // VM management
    createResumeVMTool,
    getVMStatusTool,
    cleanupVMTool,
    listBackgroundProcessesTool,
    killBackgroundProcessTool,
    checkProcessStatusTool,
    cloneRepoVMTool,
    execShellVMTool,
    execShellManyVMTool,
    
    // VM filesystem
    vmLsTool,
    vmReadFileTool,
    vmReadRegionsTool,
    vmWriteFileTool,
    vmMkdirPTool,

    // Minimal-diff edit tools
    vmRgSearchTool,
    vmReplaceInFileTool,
    vmReplaceRegexInFileTool,
    vmApplyPatchHunkTool,
    // New: write file and return unified diff (GitHub-style)
    vmModifyWithDiffTool,
    vmBatchEditTool,

    // GitOps tools (RESTRICTED to GitOps subagent by policy; registered for availability)
    gitGetCurrentBranchTool,
    gitCreateBranchTool,
    gitSwitchBranchTool,
    gitListCommitsTool,
    gitCommitTool,
    gitPushBranchTool,
    githubCreatePRTool,
  ],
  instructions: getPentestingInstructions(),
  subagents: [
    fullStackEditorSubAgent,
    securityReviewerSubAgent,
    gitOpsSubAgent,
  ],
}).withConfig({ recursionLimit: 1000 })

penTestingDeepAgent.checkpointer = checkpointer;

export const graph = penTestingDeepAgent;