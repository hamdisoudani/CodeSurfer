import axios, { AxiosInstance } from "axios";
import { createServerClient } from '@supabase/ssr';
import { cookies } from "next/headers";

// Server-only axios factory (do not import in client components)
export function getServerAxios(authHeader?: string): AxiosInstance {
  // Prefer internal URL for server-to-server calls inside Docker network
  const baseURL = process.env.BACKEND_INTERNAL_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";
  const instance = axios.create({
    baseURL,
    headers: { "Content-Type": "application/json" },
  });
  if (authHeader) {
    instance.defaults.headers.common["Authorization"] = authHeader;
  }
  return instance;
}

// Server-only: builds axios and auto-injects Supabase access token from cookies
export async function getServerAxiosFromCookies(): Promise<AxiosInstance> {
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
          // Ignore if called from Server Component
        }
      },
    },
  });

  // Get the session to extract the access token
  // Use getUser() instead of getSession() for more secure token validation
  const { data: { user }, error } = await supabase.auth.getUser();
  
  if (error || !user) {
    // No valid session, return axios without auth header
    return getServerAxios();
  }
  
  // Get fresh session data which includes the latest access token
  const { data: { session } } = await supabase.auth.getSession();
  const authHeader = session?.access_token ? `Bearer ${session.access_token}` : undefined;
  
  return getServerAxios(authHeader);
}


