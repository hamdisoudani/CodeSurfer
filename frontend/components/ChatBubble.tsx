import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { User, Bot, Wrench } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

type Message = {
  role?: string;
  type?: string;
  content: any;
  tool_call_id?: string;
  additional_kwargs?: any;
  tool_calls?: Array<{ id?: string; name?: string }>;
};

function renderContent(content: any) {
  if (Array.isArray(content)) {
    return (
      <div className="space-y-1">
        {content.map((c: any, i: number) => (
          <pre key={i} className="whitespace-pre-wrap break-words">
            {typeof c === "string" ? c : c.text ?? JSON.stringify(c, null, 2)}
          </pre>
        ))}
      </div>
    );
  }
  if (typeof content === "string") {
    try {
      const parsed = JSON.parse(content);
      return (
        <pre className="whitespace-pre-wrap break-words">
          {JSON.stringify(parsed, null, 2)}
        </pre>
      );
    } catch {
      return <div className="whitespace-pre-wrap break-words">{content}</div>;
    }
  }
  if (content && content.url && content.title) {
    return (
      <a href={content.url} target="_blank" rel="noreferrer" className="underline">
        {content.title}
      </a>
    );
  }
  return <div className="whitespace-pre-wrap break-words">{JSON.stringify(content)}</div>;
}

export function ChatBubble({ m }: { m: Message }) {
  const isUser = m.role === "user" || m.type === "human";
  const isAI = m.role === "assistant" || m.type === "ai";
  const isTool = m.role === "tool" || m.type === "tool";
  
  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <Avatar className="w-8 h-8 mt-1">
          <AvatarFallback className="bg-primary text-primary-foreground">
            {isAI ? <Bot className="w-4 h-4" /> : <Wrench className="w-4 h-4" />}
          </AvatarFallback>
        </Avatar>
      )}
      
      <div className={`max-w-[75%] ${isUser ? "order-first" : ""}`}>
        <Card className={`${
          isUser 
            ? "bg-primary text-primary-foreground border-primary" 
            : isAI 
            ? "bg-card" 
            : "bg-muted border-muted"
        }`}>
          <CardContent className="p-3">
            <div className="mb-2 flex items-center gap-2">
              <Badge variant={isUser ? "secondary" : isAI ? "default" : "outline"} className="text-xs">
                {isUser ? "You" : isAI ? "Assistant" : "Tool"}
              </Badge>
              {isAI && m.tool_calls && m.tool_calls.length > 0 && (
                <div className="flex gap-1">
                  {m.tool_calls.map((t, i) => (
                    <Badge key={t.id ?? i} variant="outline" className="text-xs">
                      {t.name ?? "tool"}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="text-sm">
              {renderContent(m.content)}
            </div>
          </CardContent>
        </Card>
      </div>
      
      {isUser && (
        <Avatar className="w-8 h-8 mt-1">
          <AvatarFallback className="bg-secondary text-secondary-foreground">
            <User className="w-4 h-4" />
          </AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}


