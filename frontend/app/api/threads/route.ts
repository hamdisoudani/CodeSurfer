import { Client } from "@langchain/langgraph-sdk";
import { requireAuthWithSession } from "@/lib/supabase-server";

function getClientWithAuth(accessToken: string) {
  const apiUrl = process.env.LANGGRAPH_INTERNAL_URL || process.env.NEXT_PUBLIC_LANGGRAPH_API_URL;
  console.log(" \n apiUrl ", apiUrl);
  return new Client({ 
    apiUrl,
    defaultHeaders: {
      "Authorization": `Bearer ${accessToken}`
    }
  });
}

export async function GET() {
  try {
    const { user, accessToken } = await requireAuthWithSession();
    
    const client = getClientWithAuth(accessToken);
    console.log(" \n user id ", user.id);
    const threads = await client.threads.search({
      metadata: { user_id: user.id },
      limit: 100,
    } as any);
    return Response.json({ threads });
  } catch (e: any) {
    console.log(" \n error ", e);
    if (e instanceof Response) {
      return e;
    }
    return new Response(JSON.stringify({ error: "failed to get threads" }), { status: 500 });
  }
}

// POST method removed - thread creation is now handled by useStream hook


