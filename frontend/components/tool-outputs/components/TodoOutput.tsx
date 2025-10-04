import { memo } from "react";
import { CheckCircle2, Circle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Todo {
  content: string;
  status: "pending" | "completed" | "cancelled";
}

interface TodoOutputProps {
  result: unknown;
}

export const TodoOutput = memo<TodoOutputProps>(({ result }) => {
  // Parse the result to extract todos
  let todos: Todo[] = [];
  
  try {
    let resultStr = typeof result === 'string' ? result : JSON.stringify(result);
    
    // Extract JSON from text like "Updated todo list to [{...}]"
    // Look for JSON array or object in the string
    const jsonMatch = resultStr.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
    
    if (jsonMatch) {
      resultStr = jsonMatch[1];
    }
    
    const parsed = JSON.parse(resultStr);
    
    console.log('TodoOutput parsing result:', parsed);
    
    // Handle array of todos directly
    if (Array.isArray(parsed)) {
      todos = parsed;
    }
    // Handle object with todos array
    else if (parsed && typeof parsed === 'object') {
      // Check for todos in various keys
      const possibleKeys = ['todos', 'items', 'list', 'data', 'tasks'];
      for (const key of possibleKeys) {
        if (Array.isArray((parsed as any)[key])) {
          todos = (parsed as any)[key];
          break;
        }
      }
      
      // If still no todos found, check if the object itself is a single todo
      if (todos.length === 0 && (parsed as any).content && (parsed as any).status) {
        todos = [parsed as Todo];
      }
    }
  } catch (e) {
    console.error('Failed to parse todos:', e);
    // If parsing fails, show the raw result for debugging
    console.log('Raw result:', result);
  }

  if (!todos.length) {
    return (
      <div className="text-xs text-muted-foreground p-3 text-center border border-border/40 rounded-md bg-muted/20">
        <p className="mb-2">No todos to display</p>
        <details className="text-left">
          <summary className="cursor-pointer text-[10px] hover:text-foreground">Show raw result</summary>
          <pre className="mt-2 text-[10px] bg-muted/30 rounded p-2 overflow-x-auto">
            {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
          </pre>
        </details>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {todos.map((todo, index) => {
        const statusConfig = {
          pending: {
            icon: <Circle className="w-4 h-4 text-amber-500" />,
            bg: "bg-amber-50/50 dark:bg-amber-950/20",
            border: "border-amber-200/50 dark:border-amber-800/30",
            text: "text-amber-700 dark:text-amber-300"
          },
          completed: {
            icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
            bg: "bg-emerald-50/50 dark:bg-emerald-950/20",
            border: "border-emerald-200/50 dark:border-emerald-800/30",
            text: "text-emerald-700 dark:text-emerald-300"
          },
          cancelled: {
            icon: <XCircle className="w-4 h-4 text-red-500" />,
            bg: "bg-red-50/50 dark:bg-red-950/20",
            border: "border-red-200/50 dark:border-red-800/30",
            text: "text-red-700 dark:text-red-300"
          }
        };

        const config = statusConfig[todo.status] || statusConfig.pending;

        return (
          <div
            key={index}
            className={cn(
              "flex items-start gap-3 p-3 rounded-lg border transition-colors",
              config.bg,
              config.border
            )}
          >
            <div className="flex-shrink-0 mt-0.5">
              {config.icon}
            </div>
            
            <div className="flex-1 min-w-0">
              <p className={cn(
                "text-xs leading-relaxed",
                todo.status === "completed" && "line-through opacity-70",
                todo.status === "cancelled" && "line-through opacity-60"
              )}>
                {todo.content}
              </p>
            </div>

            <div className="flex-shrink-0">
              <span className={cn(
                "text-[10px] font-medium px-2 py-0.5 rounded-full capitalize",
                config.text,
                config.bg
              )}>
                {todo.status}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
});

TodoOutput.displayName = "TodoOutput";

