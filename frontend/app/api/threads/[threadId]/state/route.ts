import { NextRequest } from "next/server";
import { Client } from "@langchain/langgraph-sdk";
import { requireAuthWithSession } from "@/lib/supabase-server";

function getClientWithAuth(accessToken: string) {
  const apiUrl = process.env.LANGGRAPH_INTERNAL_URL || process.env.NEXT_PUBLIC_LANGGRAPH_API_URL;
  return new Client({ 
    apiUrl,
    defaultHeaders: {
      "Authorization": `Bearer ${accessToken}`
    }
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const { user, accessToken } = await requireAuthWithSession();
    
    const { threadId } = await params;
    const client = getClientWithAuth(accessToken);
    
    // With LangGraph auth, user filtering is handled automatically
    // but we can still do a manual check if needed
    const threadInfo = await client.threads.get(threadId);
    const threadUserId = threadInfo.metadata?.user_id;
    
    if (threadUserId !== user.id) {
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
    }
    
    const state = await client.threads.getState(threadId);
    return Response.json(state);
  } catch (e: any) {
    if (e instanceof Response) {
      return e;
    }
    return new Response(JSON.stringify({ error: "failed to get thread state" }), { status: 500 });
  }
}


