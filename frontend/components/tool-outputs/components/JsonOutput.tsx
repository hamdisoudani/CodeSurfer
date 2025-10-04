import { memo, useMemo } from "react";
import { JsonView } from "../../renderers/JsonView";
import { ParsedToolData } from "../types";

interface JsonOutputProps {
  data: ParsedToolData;
}

export const JsonOutput = memo<JsonOutputProps>(({ data }) => {
  const { json } = data;
  
  if (!json) {
    return null;
  }
  
  return <JsonView data={json} />;
});

JsonOutput.displayName = "JsonOutput";

// Display parsed diff hunks with red/green styling if present in JSON
export const DiffOutput = memo(function DiffOutput({ json }: { json: any }) {
  const files = useMemo(() => {
    if (!json) return [] as Array<{ filePath?: string; parsedHunks?: any[]; totals?: any; diff?: string }>;
    if (Array.isArray(json.results)) return json.results;
    return [json];
  }, [json]);

  if (!files.length) return null;

  return (
    <div className="space-y-3">
      {files.map((f, idx) => (
        <div key={idx} className="border rounded-md">
          <div className="px-3 py-2 text-xs font-medium bg-muted/40 flex items-center gap-2">
            <span>{f.filePath || "Changes"}</span>
            {f.totals && (
              <span className="text-green-600">+{f.totals.added}</span>
            )}
            {f.totals && (
              <span className="text-red-600">-{f.totals.removed}</span>
            )}
          </div>
          <div className="p-3 overflow-auto">
            {(f.parsedHunks || []).map((h: any, i: number) => (
              <div key={i} className="mb-3">
                <div className="text-[10px] text-muted-foreground mb-1">{h.header}</div>
                <pre className="text-[11px] leading-4 whitespace-pre-wrap break-words">
                  {h.lines.map((ln: string, li: number) => (
                    <div key={li} className={
                      ln.startsWith("+") ? "text-green-600" : ln.startsWith("-") ? "text-red-600" : ""
                    }>
                      {ln}
                    </div>
                  ))}
                </pre>
              </div>
            ))}
            {!f.parsedHunks && f.diff && (
              <pre className="text-[11px] leading-4 whitespace-pre-wrap break-words">{f.diff}</pre>
            )}
          </div>
        </div>
      ))}
    </div>
  );
});
