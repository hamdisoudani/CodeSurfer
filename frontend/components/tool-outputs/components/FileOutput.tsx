import { memo } from "react";
import { CodeBlock } from "../../renderers/CodeBlock";
import { ParsedToolData } from "../types";

interface FileOutputProps {
  data: ParsedToolData;
}

export const FileOutput = memo<FileOutputProps>(({ data }) => {
  const { json, lang, startLine } = data;
  
  if (!json || typeof json !== "object" || typeof json.content !== "string") {
    return null;
  }
  
  const content = String(json.content);
  
  if (lang) {
    return (
      <CodeBlock 
        code={content} 
        language={lang} 
        startLine={startLine}
        maxHeight="500px"
      />
    );
  }
  
  return (
    <div className="border border-border/50 rounded-md overflow-hidden">
      <div className="max-h-[500px] overflow-y-auto">
        <pre className="text-xs font-mono whitespace-pre-wrap break-words p-3 bg-muted">
          {content.split('\n').map((line, i) => (
            <div key={i} className="flex">
              <div className="select-none text-muted-foreground/60 text-right pr-3 min-w-[3rem] flex-shrink-0">
                {startLine! + i}
              </div>
              <div className="flex-1">{line}</div>
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
});

FileOutput.displayName = "FileOutput";
