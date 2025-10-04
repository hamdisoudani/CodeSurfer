import { memo } from "react";
import { DirectoryFileIcon } from "../utils/DirectoryFileIcon";
import { ParsedToolData } from "../types";

interface DirectoryFile {
  name: string;
  isDirectory: boolean;
  size?: string;
  permissions?: string;
}

interface DirectoryOutputProps {
  data: ParsedToolData;
}

function formatFileSize(sizeStr: string): string {
  const size = parseInt(sizeStr, 10);
  if (isNaN(size)) return sizeStr;
  
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)}MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}

function parseDirectoryListing(stdout: string): DirectoryFile[] {
  const lines = stdout.split('\n').filter(line => line.trim());
  const files: DirectoryFile[] = [];
  
  for (const line of lines) {
    if (line.startsWith('total ') || !line.trim()) continue;
    
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 9) {
      const permissions = parts[0];
      const rawSize = parts[4];
      const rawName = parts.slice(8).join(' ');
      const isDirectory = permissions.startsWith('d');
      
      const name = (() => {
        try {
          return decodeURIComponent(rawName);
        } catch {
          return rawName;
        }
      })();
      const size = isDirectory ? undefined : formatFileSize(rawSize);
      
      files.push({ name, isDirectory, size, permissions });
    } else {
      const rawName = line.trim();
      const isDirectory = rawName.endsWith('/');
      const name = (() => {
        try {
          return decodeURIComponent(rawName.replace(/\/$/, ''));
        } catch {
          return rawName.replace(/\/$/, '');
        }
      })();
      files.push({ name, isDirectory });
    }
  }
  
  return files;
}

export const DirectoryOutput = memo<DirectoryOutputProps>(({ data }) => {
  const { json } = data;
  
  if (!json || typeof json !== "object" || typeof json.stdout !== "string") {
    return null;
  }
  
  const files = parseDirectoryListing(String(json.stdout));
  
  return (
    <div className="border border-border/50 rounded-md overflow-hidden">
      <div className="max-h-[500px] overflow-y-auto">
        <div className="space-y-1 p-3">
          {files.map((item, i) => (
            <div key={i} className="flex items-center gap-3 py-1.5 px-2 hover:bg-muted/30 rounded-sm transition-colors">
              <DirectoryFileIcon 
                fileName={item.name} 
                isDirectory={item.isDirectory}
                className="w-4 h-4 flex-shrink-0"
              />
              <div className="flex-1 min-w-0 flex items-center justify-between">
                <span className="text-sm font-mono truncate">
                  {item.name}
                </span>
                {item.size && !item.isDirectory && (
                  <span className="text-xs text-muted-foreground/70 ml-2 flex-shrink-0 tabular-nums">
                    {item.size}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

DirectoryOutput.displayName = "DirectoryOutput";
