"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginTest() {
  const supabase = getSupabaseBrowserClient();
  const [me, setMe] = useState<any>(null);
  const [status, setStatus] = useState<"loading" | "authenticated" | "unauthenticated">("loading");

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setStatus(data.session ? "authenticated" : "unauthenticated");
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) => {
      setStatus(sess ? "authenticated" : "unauthenticated");
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, [supabase]);

  const signIn = async () => {
    await supabase.auth.signInWithOAuth({ provider: "github" });
  };
  const signOut = async () => {
    await supabase.auth.signOut();
    setMe(null);
  };
  const callBackendMe = async () => {
    if (status !== "authenticated") return;
    const res = await fetch("/api/me");
    const data = await res.json();
    setMe(data);
  };

  return (
    <div className="min-h-screen grid place-items-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Supabase Auth Test</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>Status: {status}</div>
          <div className="flex gap-2">
            <Button onClick={signIn} disabled={status === "authenticated"}>Sign in with GitHub</Button>
            <Button variant="secondary" onClick={signOut} disabled={status !== "authenticated"}>Sign out</Button>
          </div>
          <div className="flex gap-2">
            <Button onClick={callBackendMe} disabled={status !== "authenticated"}>Who am I (backend)</Button>
          </div>
          {me && (
            <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">{JSON.stringify(me, null, 2)}</pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


