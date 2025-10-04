import { memo } from "react";
import { Markdown } from "../../renderers/Markdown";

interface MarkdownOutputProps {
  result: unknown;
}

export const MarkdownOutput = memo<MarkdownOutputProps>(({ result }) => {
  return <Markdown>{String(result ?? "")}</Markdown>;
});

MarkdownOutput.displayName = "MarkdownOutput";
