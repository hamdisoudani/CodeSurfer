import { memo } from "react";
import { 
  VscFile,
  VscFolder,
} from "react-icons/vsc";
import { 
  SiTypescript,
  SiJavascript,
  SiReact,
  SiPython,
  SiGo,
  SiRust,
  SiPhp,
  SiRuby,
  SiCplusplus,
  SiSwift,
  SiKotlin,
  SiHtml5,
  SiCss3,
  SiSass,
  SiVuedotjs,
  SiSvelte
} from "react-icons/si";

interface DirectoryFileIconProps {
  fileName: string;
  isDirectory?: boolean;
  className?: string;
}

function getDirectoryFileIcon(fileName: string, isDirectory: boolean = false) {
  if (isDirectory) return VscFolder;
  if (!fileName) return VscFile;
  
  const ext = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() : '';
  
  const iconMap: Record<string, any> = {
    // JavaScript/TypeScript with specific icons
    'ts': SiTypescript, 'tsx': SiReact, 
    'js': SiJavascript, 'jsx': SiReact,
    'mjs': SiJavascript, 'cjs': SiJavascript,
    
    // Other Programming Languages with specific icons
    'py': SiPython, 'go': SiGo, 'rs': SiRust, 'rust': SiRust,
    'java': VscFile, 'kt': SiKotlin, 'cs': VscFile, 
    'php': SiPhp, 'rb': SiRuby, 'cpp': SiCplusplus, 'c': SiCplusplus,
    'swift': SiSwift, 'dart': VscFile, 'scala': VscFile,
    
    // Web Technologies
    'html': SiHtml5, 'htm': SiHtml5,
    'css': SiCss3, 'scss': SiSass, 'sass': SiSass,
    'vue': SiVuedotjs, 'svelte': SiSvelte,
  };
  
  return iconMap[ext || ''] || VscFile;
}

export const DirectoryFileIcon = memo<DirectoryFileIconProps>(({ fileName, isDirectory = false, className }) => {
  const IconComponent = getDirectoryFileIcon(fileName, isDirectory);
  const ext = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() : '';
  
  // Add color classes for specific file types
  const colorMap: Record<string, string> = {
    'ts': 'text-blue-600', // TypeScript blue
    'tsx': 'text-blue-500', // React TypeScript
    'js': 'text-yellow-500', // JavaScript yellow
    'jsx': 'text-blue-400', // React blue
    'py': 'text-yellow-600', // Python yellow
    'go': 'text-cyan-500', // Go cyan
    'rs': 'text-orange-600', // Rust orange
    'php': 'text-purple-600', // PHP purple
    'rb': 'text-red-500', // Ruby red
    'swift': 'text-orange-500', // Swift orange
    'html': 'text-orange-600', // HTML orange
    'css': 'text-blue-500', // CSS blue
    'scss': 'text-pink-500', // Sass pink
    'vue': 'text-green-500', // Vue green
    'svelte': 'text-orange-500', // Svelte orange
  };
  
  const colorClass = isDirectory ? 'text-blue-500' : (colorMap[ext || ''] || 'text-muted-foreground');
  
  return <IconComponent className={`${className} ${colorClass}`} />;
});

DirectoryFileIcon.displayName = "DirectoryFileIcon";
