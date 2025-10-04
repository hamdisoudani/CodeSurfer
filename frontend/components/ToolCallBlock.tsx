import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, CheckCircle2, Clock, AlertCircle } from "lucide-react";

export type ToolCall = {
  id: string;
  name: string;
  args?: unknown;
  result?: unknown;
  status: "executing" | "completed" | "error";
};

export function ToolCallBlock({ call }: { call: ToolCall }) {
  const [isOpen, setIsOpen] = React.useState(call.status === "completed");
  
  const statusIcon = {
    executing: <Clock className="w-4 h-4 text-yellow-600" />,
    completed: <CheckCircle2 className="w-4 h-4 text-green-600" />,
    error: <AlertCircle className="w-4 h-4 text-red-600" />
  }[call.status as string] || <Clock className="w-4 h-4 text-gray-600" />;
  
  const statusColor = {
    executing: "text-yellow-700 bg-yellow-50 border-yellow-200",
    completed: "text-green-700 bg-green-50 border-green-200",
    error: "text-red-700 bg-red-50 border-red-200"
  }[call.status as string] || "text-gray-700 bg-gray-50 border-gray-200";
  
  return (
    <Card className="bg-muted/50">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="pb-3 cursor-pointer hover:bg-muted/30 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {statusIcon}
                <div>
                  <CardTitle className="text-sm font-medium">{call.name}</CardTitle>
                  <div className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border ${statusColor} mt-1`}>
                    {call.status === "executing" && "Running..."}
                    {call.status === "completed" && "Completed"}
                    {call.status === "error" && "Error"}
                  </div>
                </div>
              </div>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </Button>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-3">
            {call.args !== undefined && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                  Input Arguments
                </div>
                <div className="bg-background border rounded-md p-3">
                  <pre className="text-xs whitespace-pre-wrap break-words text-muted-foreground">
                    {safeJson(call.args)}
                  </pre>
                </div>
              </div>
            )}
            
            {call.result !== undefined && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                  Result
                </div>
                <div className="bg-background border rounded-md p-3">
                  <pre className="text-xs whitespace-pre-wrap break-words">
                    {safeJson(call.result)}
                  </pre>
                </div>
              </div>
            )}
            
            {call.status === "executing" && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="animate-spin w-3 h-3 border border-gray-300 border-t-gray-600 rounded-full"></div>
                Executing tool...
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function safeJson(val: unknown): string {
  try {
    if (typeof val === "string") {
      try {
        const parsed = JSON.parse(val);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return val;
      }
    }
    return JSON.stringify(val, null, 2);
  } catch {
    return String(val);
  }
}


