import { memo } from "react";
import { CodeBlock } from "../../renderers/CodeBlock";
import { ParsedToolData } from "../types";

interface ShellOutputProps {
  data: ParsedToolData;
}

export const ShellOutput = memo<ShellOutputProps>(({ data }) => {
  const { json } = data;
  
  if (!json || typeof json !== "object" || typeof json.stdout !== "string") {
    return null;
  }
  
  const stdout = String(json.stdout);
  const hasOutput = stdout.trim().length > 0;
  
  if (!hasOutput) {
    return (
      <div className="w-full overflow-hidden max-w-[650px]">
        <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 bg-muted/20 rounded-md border border-border/50">
          <span className="italic">No output</span>
        </div>
      </div>
    );
  }
  
  return (
    <div className="w-full overflow-hidden max-w-[650px]">
      <CodeBlock 
        code={stdout} 
        language="bash" 
        maxHeight="500px"
      />
    </div>
  );
});

ShellOutput.displayName = "ShellOutput";
