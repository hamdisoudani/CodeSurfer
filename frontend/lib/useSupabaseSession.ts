"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export function useSupabaseSession() {
  const supabase = getSupabaseBrowserClient();
  const [session, setSession] = useState<any>(null);
  const [status, setStatus] = useState<"loading" | "authenticated" | "unauthenticated">("loading");

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session);
      setStatus(data.session ? "authenticated" : "unauthenticated");
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) => {
      setSession(sess);
      setStatus(sess ? "authenticated" : "unauthenticated");
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, [supabase]);

  return { session, status } as const;
}


