import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { Daytona } from "@daytonaio/sdk";

// Daytona inspection tool for listing existing sandboxes and filtering by labels/id
export const inspectDaytonaTool = tool(
  async ({ id, labels }: { id?: string, labels?: Record<string,string> }) => {
    const daytona = new Daytona({
      apiKey: process.env.DAYTONA_API_KEY,
      apiUrl: process.env.DAYTONA_API_URL || 'https://app.daytona.io/api',
      target: process.env.DAYTONA_TARGET as any || 'us',
    });
    if (id) {
      try {
        const sandbox = await daytona.get(id);
        const info = { 
          id: sandbox.id, 
          state: (sandbox as any).state || 'unknown',
          labels: (sandbox as any).labels || {},
          updatedAt: (sandbox as any).updatedAt || new Date().toISOString()
        };
        return { sandboxes: [{ id: info.id, state: info.state, labels: info.labels, updatedAt: info.updatedAt }] };
      } catch (e) {
        return { sandboxes: [], error: `Sandbox not found: ${id}` };
      }
    }
    try {
      const list = await daytona.list(labels);
      const results: any[] = [];
      for (const s of list || []) {
        try {
          const info = { 
            id: s.id, 
            state: (s as any).state || 'unknown',
            labels: (s as any).labels || {},
            updatedAt: (s as any).updatedAt || new Date().toISOString()
          };
          results.push({ id: info.id, state: info.state, labels: info.labels, updatedAt: info.updatedAt });
        } catch {}
      }
      return { sandboxes: results };
    } catch (e) {
      return { sandboxes: [], error: String(e) };
    }
  },
  {
    name: "inspect_daytona",
    description: "List Daytona sandboxes by id or labels to avoid duplicates and inspect current state.",
    schema: z.object({
      id: z.string().optional(),
      labels: z.record(z.string()).optional(),
    })
  }
);
