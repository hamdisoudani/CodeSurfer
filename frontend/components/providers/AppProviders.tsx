"use client";

import { ReactNode } from "react";
import { SignedIn, SignedOut } from "@/components/auth/Signed";
import { InstallationsProvider } from "@/hooks/useInstallations";
import { InstallationGated, HasInstallations, NoInstallations } from "@/components/installations/InstallationGated";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <>
      <SignedOut>
        <SignInPrompt />
      </SignedOut>
      
      <SignedIn>
        <InstallationsProvider>
          <InstallationGated>
            <NoInstallations />
            <HasInstallations>
              {children}
            </HasInstallations>
          </InstallationGated>
        </InstallationsProvider>
      </SignedIn>
    </>
  );
}

function SignInPrompt() {
  const supabase = getSupabaseBrowserClient();

  const handleSignIn = async () => {
    await supabase.auth.signInWithOAuth({ provider: "github" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Welcome to CodeSurf</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-center text-muted-foreground">
            Sign in with GitHub to get started with automated security analysis.
          </p>
          <Button onClick={handleSignIn} className="w-full" size="lg">
            Sign in with GitHub
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
