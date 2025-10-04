"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";

type MarkdownProps = {
  children: string;
  className?: string;
};

function Pre({ children, ...props }: any) {
  const [copied, setCopied] = React.useState(false);
  const text = React.useMemo(() => {
    try {
      const c: any = children;
      const raw = Array.isArray(c) ? c.map((x: any) => x?.props?.children ?? "").join("") : c?.props?.children ?? "";
      return typeof raw === "string" ? raw : String(raw ?? "");
    } catch {
      return "";
    }
  }, [children]);

  const onCopy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch {}
  };

  return (
    <div className="relative group">
      <pre className="text-xs leading-relaxed font-mono overflow-x-auto rounded-md bg-muted p-3" {...props}>
        {children}
      </pre>
      <Button variant="outline" size="icon" onClick={onCopy} className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      </Button>
    </div>
  );
}

export const Markdown = React.memo(function Markdown({ children, className }: MarkdownProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="text-2xl font-bold mt-2 mb-3">{children}</h1>,
          h2: ({ children }) => <h2 className="text-xl font-semibold mt-2 mb-2">{children}</h2>,
          h3: ({ children }) => <h3 className="text-lg font-semibold mt-2 mb-1.5">{children}</h3>,
          p: ({ children }) => <p className="leading-7 mb-2 whitespace-pre-wrap">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-5 space-y-1 mb-2">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1 mb-2">{children}</ol>,
          li: ({ children }) => <li className="leading-6">{children}</li>,
          a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer" className="text-primary underline break-words">{children}</a>,
          table: ({ children }) => <table className="w-full text-sm border border-border/60 rounded-md overflow-hidden mb-3">{children}</table>,
          thead: ({ children }) => <thead className="bg-muted/50">{children}</thead>,
          th: ({ children }) => <th className="text-left px-3 py-2 border-b border-border/60">{children}</th>,
          td: ({ children }) => <td className="px-3 py-2 border-b border-border/60 align-top">{children}</td>,
          blockquote: ({ children }) => <blockquote className="border-l-2 border-border pl-3 italic text-muted-foreground mb-2">{children}</blockquote>,
          hr: () => <hr className="my-3 border-border/60" />,
          code: ({ className: cn, children, ...props }) => (
            <code className={`text-xs font-mono bg-muted rounded px-1.5 py-0.5 ${cn || ""}`} {...props}>{children}</code>
          ),
          pre: Pre as any,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
});

export default Markdown;


