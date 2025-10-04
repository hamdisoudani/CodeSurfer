# ThinkingBlock Component - Usage Guide

## Overview

The `ThinkingBlock` component renders AI thinking/reasoning processes in a beautiful, collapsible UI. It automatically detects and extracts `<think>...</think>` tags from AI responses.

## Features

- ✨ **Beautiful Purple Theme** - Matches thinking model aesthetic
- 🧠 **Brain Icon** - Clear visual indicator
- ✅ **Completion Badge** - Shows when thinking is complete
- 📖 **Collapsible Content** - Expandable to view full reasoning
- 📝 **Preview Text** - Shows first 150 characters when collapsed
- 🎨 **Syntax Highlighting** - Monospace font for code/technical content

## How It Works

### 1. AI Response Format

When using thinking models (like Claude with extended thinking), the response contains thinking blocks:

```
<think>
Okay, let's analyze this codebase. First, I'll check the package.json to understand dependencies. Then I'll look at the folder structure...
</think>

Here's what I found: This is a NestJS backend with TypeScript...
```

### 2. Automatic Extraction

The `extractThinkingBlocks()` utility automatically:
- Finds all `<think>...</think>` blocks
- Extracts the thinking content
- Returns clean content without the thinking blocks

### 3. Rendering

The `ChatMessage` component automatically:
1. Detects thinking blocks in AI messages
2. Renders them in beautiful purple cards
3. Shows the main content below

## Example Response

```typescript
// AI response with thinking
const aiResponse = `<think>
The user wants to understand the security vulnerabilities in their codebase. I should:
1. Start by analyzing the authentication flow
2. Check for SQL injection risks
3. Review the dependency versions for known CVEs
4. Look at input validation

This is a comprehensive security audit, so I'll use multiple tools to gather information systematically.
</think>

I'll help you analyze the security of your codebase. Let me start by examining the authentication implementation and checking for common vulnerabilities.`;
```

**Renders as:**
```
┌─────────────────────────────────────────────┐
│ 🧠 AI Reasoning              ✓ Completed    │
├─────────────────────────────────────────────┤
│ The user wants to understand the security   │
│ vulnerabilities in their codebase...        │
└─────────────────────────────────────────────┘

I'll help you analyze the security of your 
codebase. Let me start by examining the 
authentication implementation...
```

## Component API

### ThinkingBlock Props

```typescript
interface ThinkingBlockProps {
  content: string;        // The thinking content (without <think> tags)
  isCompleted?: boolean;  // Show "Completed" badge (default: true)
  className?: string;     // Additional CSS classes
}
```

### extractThinkingBlocks Utility

```typescript
function extractThinkingBlocks(content: string): {
  thinking: string[];    // Array of thinking block contents
  cleanContent: string;  // Content with thinking blocks removed
}
```

## Usage Example

### Direct Usage

```tsx
import { ThinkingBlock } from '@/components/ThinkingBlock';

function MyComponent() {
  const thinking = "Let me analyze this step by step...";
  
  return (
    <ThinkingBlock 
      content={thinking} 
      isCompleted={true}
    />
  );
}
```

### With Content Extraction

```tsx
import { extractThinkingBlocks, ThinkingBlock } from '@/components/ThinkingBlock';

function MyComponent() {
  const fullResponse = `<think>First, I'll check...</think>Here's the answer`;
  const { thinking, cleanContent } = extractThinkingBlocks(fullResponse);
  
  return (
    <>
      {thinking.map((think, i) => (
        <ThinkingBlock key={i} content={think} />
      ))}
      <div>{cleanContent}</div>
    </>
  );
}
```

## Styling

The component uses:
- **Purple/Violet color scheme** - `purple-50`, `purple-500`, `purple-900`
- **Smooth animations** - 300ms transitions
- **Monospace content** - For code/technical reasoning
- **Responsive design** - Works on all screen sizes

## Integration Status

✅ **Automatically integrated** in `ChatMessage.tsx`
- Detects thinking blocks in AI messages
- Extracts and renders them automatically
- No additional configuration needed

## Testing

To test the component, send a message to your AI agent and include thinking tags in the response:

```typescript
const response = `<think>
Step 1: Analyze the request
Step 2: Gather context  
Step 3: Formulate response
</think>

Based on my analysis, here's what I found...`;
```

The thinking block will automatically render above the main content! 🎉

