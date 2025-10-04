"use client";

import { ReactNode } from "react";
import { useInstallations } from "@/hooks/useInstallations";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, Github, Loader2 } from "lucide-react";

interface InstallationGatedProps {
  children: ReactNode;
}

interface HasInstallationsProps {
  children: ReactNode;
}

interface NoInstallationsProps {
  children?: ReactNode;
}

export function InstallationGated({ children }: InstallationGatedProps) {
  const { isLoading, error } = useInstallations();

  if (isLoading) {
    return <InstallationLoading />;
  }

  if (error) {
    return <InstallationError error={error} />;
  }

  return <>{children}</>;
}

export function HasInstallations({ children }: HasInstallationsProps) {
  const { hasInstallations } = useInstallations();
  
  if (!hasInstallations) {
    return null;
  }
  
  return <>{children}</>;
}

export function NoInstallations({ children }: NoInstallationsProps) {
  const { hasInstallations } = useInstallations();
  
  if (hasInstallations) {
    return null;
  }
  
  return (
    <>
      {children || <DefaultInstallationPrompt />}
    </>
  );
}

function InstallationLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin mb-4" />
          <p className="text-muted-foreground">Checking GitHub App installations...</p>
        </CardContent>
      </Card>
    </div>
  );
}

function InstallationError({ error }: { error: string }) {
  const { refetch } = useInstallations();
  
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            Installation Check Failed
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button onClick={refetch} className="w-full">
            Retry
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function DefaultInstallationPrompt() {
  const handleInstallApp = () => {
    // Redirect to GitHub App installation
    // Using the environment variable from plan_todo.md
    const installUrl = process.env.NEXT_PUBLIC_GITHUB_APP_INSTALL_URL as string;
    console.log('🔗 Install URL:', installUrl);
    
    if (!installUrl) {
      console.error('❌ NEXT_PUBLIC_GITHUB_APP_INSTALL_URL not configured');
      return;
    }
    
    // Add redirect URL to return to our API callback
    const callbackUrl = `${window.location.origin}/api/github/callback`;
    const fullInstallUrl = `${installUrl}?redirect_uri=${encodeURIComponent(callbackUrl)}`;
    console.log('🚀 Redirecting to GitHub App installation:', fullInstallUrl);
    
    window.location.href = fullInstallUrl;
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-muted flex items-center justify-center">
            <Github className="h-6 w-6" />
          </div>
          <CardTitle>Install GitHub App</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-muted-foreground">
            To get started, you need to install our GitHub App to grant access to your repositories.
          </p>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>The app will allow us to:</p>
            <ul className="list-disc list-inside space-y-1 text-left max-w-sm mx-auto">
              <li>Access your repository code</li>
              <li>Create analysis reports</li>
              <li>Set up automated security scans</li>
            </ul>
          </div>
          <Button onClick={handleInstallApp} className="w-full" size="lg">
            <Github className="mr-2 h-4 w-4" />
            Install GitHub App
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
