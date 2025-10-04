"use client";

// This file maintains backward compatibility while using the refactored components
import { ToolOutputRefactored } from "./tool-outputs";

type ToolOutputProps = {
  name: string;
  status: "executing" | "completed" | "error";
  result?: unknown;
  args?: unknown;
  hideHeader?: boolean;
};

// Backward compatibility wrapper - uses the refactored component
export function ToolOutput({ name, status, result, args, hideHeader = false }: ToolOutputProps) {
  return (
    <ToolOutputRefactored 
      name={name}
      status={status}
      result={result}
      args={args}
      hideHeader={hideHeader}
    />
  );
}

export default ToolOutput;


