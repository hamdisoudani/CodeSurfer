"use client";

import * as React from "react";
import { Highlight, themes } from "prism-react-renderer";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";

type CodeBlockProps = {
  code: string;
  language: string;
  startLine?: number;
  maxHeight?: string;
  showLineNumbers?: boolean;
};

export function CodeBlock({ 
  code, 
  language, 
  startLine = 1, 
  maxHeight = "400px",
  showLineNumbers = true 
}: CodeBlockProps) {
  const [copied, setCopied] = React.useState(false);

  const onCopy = async () => {
    try { 
      await navigator.clipboard.writeText(code); 
      setCopied(true); 
      setTimeout(() => setCopied(false), 1200); 
    } catch {}
  };

  return (
    <div className="relative group border border-border/50 rounded-md overflow-hidden">
      <div 
        className="w-full overflow-auto"
        style={{ maxHeight }}
      >
        <Highlight theme={themes.vsLight} code={code} language={language}>
          {({ className, style, tokens, getLineProps, getTokenProps }) => (
            <pre 
              className="text-xs leading-relaxed font-mono bg-muted p-0 m-0" 
              style={{ ...style, background: 'hsl(var(--muted))' }}
            >
              {tokens.map((line, i) => {
                const lineNumber = startLine + i;
                return (
                  <div key={i} {...getLineProps({ line })} className="flex min-h-[1.5rem]">
                    {showLineNumbers && (
                      <div className="select-none text-muted-foreground/60 text-right pr-3 pl-3 py-1 bg-muted/50 border-r border-border/30 min-w-[3rem] flex-shrink-0">
                        {lineNumber}
                      </div>
                    )}
                    <div className="flex-1 px-3 py-1">
                      {line.map((token, key) => (
                        <span key={key} {...getTokenProps({ token })} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </pre>
          )}
        </Highlight>
      </div>
      <Button 
        variant="outline" 
        size="icon" 
        onClick={onCopy} 
        className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 backdrop-blur-sm"
      >
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      </Button>
    </div>
  );
}

export default CodeBlock;
