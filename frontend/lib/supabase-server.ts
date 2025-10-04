import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function getSupabaseUser() {
  const cookieStore = await cookies();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
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
          // The `setAll` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing
          // user sessions.
        }
      },
    },
  });

  const { data: { user }, error } = await supabase.auth.getUser();
  return { user, error };
}

export async function getSupabaseSession() {
  const cookieStore = await cookies();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
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
          // The `setAll` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing
          // user sessions.
        }
      },
    },
  });

  const { data: { session }, error } = await supabase.auth.getSession();
  return { session, error };
}

export async function requireAuth() {
  const { user, error } = await getSupabaseUser();
  
  if (error || !user) {
    throw new Response(JSON.stringify({ error: "unauthenticated" }), { status: 401 });
  }
  
  return user;
}

export async function requireAuthWithSession() {
  const { session, error } = await getSupabaseSession();
  
  if (error || !session?.user) {
    throw new Response(JSON.stringify({ error: "unauthenticated" }), { status: 401 });
  }
  
  return { user: session.user, accessToken: session.access_token };
}
