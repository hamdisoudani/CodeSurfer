import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';

// Proxies backend SSE stream (/workspaces/:id/events) to the browser.
// Uses internal Docker URL when available; backend SSE endpoint is anonymous.
export async function GET(_req: NextRequest, { params }: { params: { workspaceId: string } }) {
  const backendBase = process.env.BACKEND_INTERNAL_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
  const url = `${backendBase}/workspaces/${params.workspaceId}/events`;

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // ignore
          }
        },
      },
    }
  );

  const { data: { session } } = await supabase.auth.getSession();

  const headers: Record<string, string> = { 'Accept': 'text/event-stream' };
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }

  const upstream = await fetch(url, {
    headers,
  });

  if (!upstream.ok || !upstream.body) {
    return new Response('Failed to connect to backend SSE', { status: 502 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body!.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
      } catch {
        // swallow
      } finally {
        try { reader.releaseLock(); } catch {}
        controller.close();
      }
    },
    cancel() {
      try { upstream.body?.cancel(); } catch {}
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}

