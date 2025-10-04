"use client";

import React from "react";
import { useSupabaseSession } from "@/lib/useSupabaseSession";

export function SignedIn({ children }: { children: React.ReactNode }) {
  const { status } = useSupabaseSession();
  if (status !== "authenticated") return null;
  return <>{children}</>;
}

export function SignedOut({ children }: { children: React.ReactNode }) {
  const { status } = useSupabaseSession();
  if (status === "authenticated") return null;
  return <>{children}</>;
}


