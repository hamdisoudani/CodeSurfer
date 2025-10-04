import { NextRequest, NextResponse } from "next/server";
import { Client } from "@langchain/langgraph-sdk";
import { requireAuthWithSession } from "@/lib/supabase-server";

export async function POST(request: NextRequest) {
  try {
    // Authenticate via server helper (consistent with other routes)
    const { user, accessToken } = await requireAuthWithSession();

    const body = await request.json();
    const { thread_ids } = body;

    // Validate input
    if (!Array.isArray(thread_ids) || thread_ids.length === 0) {
      return NextResponse.json({ error: "thread_ids array is required" }, { status: 400 });
    }

    // Limit batch size to prevent overload
    const limitedIds = thread_ids.slice(0, 50);
    
    console.log(`📦 Batch thread states request for ${limitedIds.length} threads`);

    // Prepare LangGraph client with the user's access token
    const apiUrl = process.env.LANGGRAPH_INTERNAL_URL || process.env.NEXT_PUBLIC_LANGGRAPH_API_URL || "http://localhost:2024";
    const client = new Client({ 
      apiUrl,
      defaultHeaders: { "Authorization": `Bearer ${accessToken}` }
    });

    const states: Record<string, any> = {};
    const errors: Record<string, string> = {};

    // Fetch states in parallel with limited concurrency
    const CONCURRENT_LIMIT = 10;
    for (let i = 0; i < limitedIds.length; i += CONCURRENT_LIMIT) {
      const batch = limitedIds.slice(i, i + CONCURRENT_LIMIT);
      
      const promises = batch.map(async (threadId) => {
        try {
          // Use LangGraph SDK which already honors auth and routing
          const controller = new AbortController();
          const to = setTimeout(() => controller.abort(), 10000);
          try {
            const state = await client.threads.getState(threadId, { signal: controller.signal } as any);
            clearTimeout(to);
            return { threadId, state, error: null };
          } catch (e: any) {
            clearTimeout(to);
            return { threadId, state: null, error: e?.message || 'Failed to fetch state' };
          }
        } catch (error: any) {
          return { threadId, state: null, error: error.message || 'Unknown error' };
        }
      });

      const batchResults = await Promise.allSettled(promises);
      
      batchResults.forEach((result) => {
        if (result.status === 'fulfilled' && result.value) {
          const { threadId, state, error } = result.value;
          if (state) {
            states[threadId] = state;
          } else if (error) {
            errors[threadId] = error;
          }
        } else if (result.status === 'rejected') {
          // This shouldn't happen since we're catching errors in the promise
          console.error('Unexpected rejection in batch:', result.reason);
        }
      });
    }

    const successCount = Object.keys(states).length;
    const errorCount = Object.keys(errors).length;
    
    console.log(`✅ Batch complete: ${successCount} success, ${errorCount} errors`);

    return NextResponse.json({
      states,
      errors,
      summary: {
        requested: limitedIds.length,
        successful: successCount,
        failed: errorCount
      }
    });

  } catch (error: any) {
    console.error("❌ Batch thread states error:", error);
    return NextResponse.json(
      { error: "Failed to fetch thread states", details: error.message },
      { status: 500 }
    );
  }
}
