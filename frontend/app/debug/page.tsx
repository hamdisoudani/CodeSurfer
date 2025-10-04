"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function DebugPage() {
  const [installationId, setInstallationId] = useState("84467194");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const testLinkInstallation = async () => {
    setLoading(true);
    setResult(null);
    
    try {
      console.log('🧪 Testing installation link for ID:', installationId);
      
      const response = await fetch('/api/installations/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ installationId })
      });
      
      const data = await response.json();
      
      setResult({
        status: response.status,
        statusText: response.statusText,
        data: data
      });
      
      console.log('🧪 Test result:', { status: response.status, data });
      
    } catch (error) {
      console.error('🧪 Test error:', error);
      setResult({
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setLoading(false);
    }
  };

  const testCheckInstallations = async () => {
    setLoading(true);
    setResult(null);
    
    try {
      console.log('🧪 Testing installations check...');
      
      const response = await fetch('/api/installations/check');
      const data = await response.json();
      
      setResult({
        status: response.status,
        statusText: response.statusText,
        data: data
      });
      
      console.log('🧪 Check result:', { status: response.status, data });
      
    } catch (error) {
      console.error('🧪 Check error:', error);
      setResult({
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>🧪 GitHub App Installation Debug</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="installationId">Installation ID</Label>
              <Input
                id="installationId"
                value={installationId}
                onChange={(e) => setInstallationId(e.target.value)}
                placeholder="Enter installation ID"
              />
            </div>
            
            <div className="flex gap-2">
              <Button 
                onClick={testLinkInstallation} 
                disabled={loading || !installationId}
              >
                {loading ? "Testing..." : "Test Link Installation"}
              </Button>
              <Button 
                onClick={testCheckInstallations} 
                disabled={loading}
                variant="outline"
              >
                {loading ? "Testing..." : "Test Check Installations"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {result && (
          <Card>
            <CardHeader>
              <CardTitle>📋 Result</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={JSON.stringify(result, null, 2)}
                readOnly
                className="font-mono text-sm h-64"
              />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>📝 Instructions</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <p>1. Open browser dev tools (F12) and check the Console tab</p>
            <p>2. Test the installation link with ID: <code>84467194</code></p>
            <p>3. Check both frontend console and backend terminal for logs</p>
            <p>4. If it fails, check the error messages and response status</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
