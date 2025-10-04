"use client";

import * as React from "react";
import ReactJson from "react-json-view";

type JsonViewProps = {
  data: any;
  collapsed?: boolean | number;
};

export function JsonView({ data, collapsed = 2 }: JsonViewProps) {
  return (
    <div className="rounded-md border border-border/50 bg-muted/20 p-2">
      <ReactJson
        src={data}
        collapsed={collapsed}
        enableClipboard={true}
        displayDataTypes={false}
        displayObjectSize={false}
        name={false}
        theme={{
          base00: "transparent",
          base01: "#f4f4f5",
          base02: "#e4e4e7",
          base03: "#a1a1aa",
          base04: "#71717a",
          base05: "#3f3f46",
          base06: "#27272a",
          base07: "#18181b",
          base08: "#ef4444",
          base09: "#f59e0b",
          base0A: "#eab308",
          base0B: "#22c55e",
          base0C: "#06b6d4",
          base0D: "#3b82f6",
          base0E: "#a855f7",
          base0F: "#ec4899",
        }}
        style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace", fontSize: 12 }}
      />
    </div>
  );
}

export default JsonView;


