import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getCurrentTaskInput, type LangGraphRunnableConfig } from "@langchain/langgraph";
import { type PentestAgentStateType } from "../state";

// Safe override for builtin ls: always returns a string
export const lsTool = tool(
  (_input: any, config: LangGraphRunnableConfig) => {
    // Access the current graph state using getCurrentTaskInput()
    const state = getCurrentTaskInput() as PentestAgentStateType;
    const files = state?.files || {};
    const list = Object.keys(files);
    return list.join("\n");
  },
  {
    name: "ls",
    description: "List all files in the mock filesystem (stringified)",
    // Accept any shape; some model providers may send unexpected empty/extra props
    schema: z.any()
  }
);


