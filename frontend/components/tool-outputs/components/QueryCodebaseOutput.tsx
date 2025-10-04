import { memo } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { ChevronRight } from "lucide-react";
import { CodeBlock } from "../../renderers/CodeBlock";
import { DirectoryFileIcon } from "../utils/DirectoryFileIcon";
import { ParsedToolData } from "../types";

interface QueryResult {
  filePath: string;
  content: string;
  startLine?: number;
  endLine?: number;
}

interface QueryCodebaseOutputProps {
  data: ParsedToolData;
}

function extToLang(ext: string): string {
  const map: Record<string, string> = {
    ts: "ts", tsx: "tsx", js: "javascript", jsx: "jsx", json: "json",
    md: "markdown", mdx: "mdx", sh: "bash", bash: "bash", zsh: "bash",
    py: "python", go: "go", rs: "rust", java: "java", kt: "kotlin",
    cs: "csharp", php: "php", rb: "ruby", yml: "yaml", yaml: "yaml",
    toml: "toml", sql: "sql", css: "css", scss: "scss", html: "html",
    vue: "vue", svelte: "svelte",
  };
  return map[ext] || "";
}

export const QueryCodebaseOutput = memo<QueryCodebaseOutputProps>(({ data }) => {
  const { json } = data;
  
  if (!json || typeof json !== "object" || !Array.isArray(json.results) || json.results.length === 0) {
    return null;
  }
  
  const results = json.results as QueryResult[];
  
  return (
    <div className="max-h-[600px] overflow-y-auto border border-border/50 rounded-md">
      <div className="space-y-0">
        {results.map((item, i) => {
          const fileName = item.filePath ? item.filePath.split("/").pop() || "" : "";
          const ext = fileName.includes(".") ? fileName.split(".").pop()?.toLowerCase() : "";
          const lang = extToLang(ext || "");
          const startLine = item.startLine || 1;
          const endLine = item.endLine;
          
          // Create range badge
          let rangeBadge: string | undefined = undefined;
          if (startLine && endLine) {
            rangeBadge = `${startLine}–${endLine}`;
          } else if (startLine && startLine > 1) {
            rangeBadge = `from ${startLine}`;
          }
          
          return (
            <Collapsible key={i}>
              <CollapsibleTrigger asChild>
                <div className="flex items-center justify-between p-3 hover:bg-muted/30 cursor-pointer border-b border-border/30 last:border-b-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <DirectoryFileIcon 
                      fileName={fileName} 
                      isDirectory={false}
                      className="w-4 h-4 flex-shrink-0"
                    />
                    <Badge variant="outline">{fileName}</Badge>
                    {ext && <Badge variant="outline" className="uppercase text-xs">{ext}</Badge>}
                    {rangeBadge && <Badge variant="outline" className="text-xs">lines {rangeBadge}</Badge>}
                    {item.filePath && item.filePath !== fileName && (
                      <Badge variant="outline" className="text-xs">{item.filePath}</Badge>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-90" />
                </div>
              </CollapsibleTrigger>
              
              <CollapsibleContent>
                <div className="border-t border-border/30">
                  {lang ? (
                    <CodeBlock 
                      code={item.content || ""} 
                      language={lang} 
                      startLine={startLine}
                      maxHeight="400px"
                    />
                  ) : (
                    <div className="max-h-[400px] overflow-y-auto">
                      <pre className="text-xs font-mono whitespace-pre-wrap break-words p-3 bg-muted/20">
                        {String(item.content || "").split('\n').map((line, lineIdx) => (
                          <div key={lineIdx} className="flex">
                            <div className="select-none text-muted-foreground/60 text-right pr-3 min-w-[3rem] flex-shrink-0">
                              {startLine + lineIdx}
                            </div>
                            <div className="flex-1">{line}</div>
                          </div>
                        ))}
                      </pre>
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
});

QueryCodebaseOutput.displayName = "QueryCodebaseOutput";
