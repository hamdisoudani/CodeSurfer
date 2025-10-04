import { memo } from "react";
import { CodeBlock } from "../../renderers/CodeBlock";
import { JsonView } from "../../renderers/JsonView";
import { ParsedToolData } from "../types";

interface TextOutputProps {
  data: ParsedToolData;
  result: unknown;
}

// Try to extract an embedded JSON from a mixed string
function extractEmbeddedJson(text: string): { prefix: string; json: any | null; suffix: string } {
  let prefix = "";
  let suffix = "";
  let json: any | null = null;
  try {
    const firstObj = text.indexOf("{");
    const firstArr = text.indexOf("[");
    const first = Math.min(...[firstObj, firstArr].filter((v) => v >= 0));
    if (first >= 0) {
      const after = text.slice(first);
      const closeObj = after.lastIndexOf("}");
      const closeArr = after.lastIndexOf("]");
      const end = Math.max(closeObj, closeArr);
      if (end >= 0) {
        const candidate = after.slice(0, end + 1);
        try {
          json = JSON.parse(candidate);
          prefix = text.slice(0, first).trim();
          suffix = after.slice(end + 1).trim();
        } catch {}
      }
    }
  } catch {}
  return { prefix, json, suffix };
}

export const TextOutput = memo<TextOutputProps>(({ data, result }) => {
  const { lang, startLine } = data;
  
  if (typeof result !== "string") {
    return (
      <pre className="text-xs font-mono whitespace-pre-wrap break-words max-h-[500px] overflow-y-auto p-3 bg-muted rounded-md border border-border/50">
        {String(result ?? "")}
      </pre>
    );
  }
  
  // Check for embedded JSON in text
  const { prefix, json: embedded, suffix } = extractEmbeddedJson(result);
  if (embedded) {
    return (
      <div className="space-y-2">
        {prefix && <div className="text-sm whitespace-pre-wrap">{prefix}</div>}
        <JsonView data={embedded} />
        {suffix && <div className="text-sm whitespace-pre-wrap">{suffix}</div>}
      </div>
    );
  }
  
  // Render as code if language is detected
  if (lang) {
    return (
      <CodeBlock 
        code={result} 
        language={lang} 
        startLine={startLine}
        maxHeight="500px"
      />
    );
  }
  
  // Fallback to plain text
  return (
    <pre className="text-xs font-mono whitespace-pre-wrap break-words max-h-[500px] overflow-y-auto p-3 bg-muted rounded-md border border-border/50">
      {result}
    </pre>
  );
});

TextOutput.displayName = "TextOutput";
