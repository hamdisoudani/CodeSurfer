import { memo } from "react";
import { AnsiView } from "../../renderers/Ansi";

interface AnsiOutputProps {
  result: unknown;
}

export const AnsiOutput = memo<AnsiOutputProps>(({ result }) => {
  return <AnsiView>{String(result ?? "")}</AnsiView>;
});

AnsiOutput.displayName = "AnsiOutput";
