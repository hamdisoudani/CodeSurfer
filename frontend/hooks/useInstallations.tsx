"use client";

import { useCallback, useEffect, useMemo, useRef, useState, createContext, useContext } from "react";

type Repo = any;
type Branch = any;

export function useInstallationRepos(installationId: string | null) {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (!installationId) { setRepos([]); return; }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    setError(undefined);
    try {
      const res = await fetch(`/api/installations/repos?installation_id=${installationId}`, { signal: ac.signal, cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to load repos (${res.status})`);
      const data = await res.json();
      setRepos(data.data?.repositories || []);
    } catch (e:any) {
      if (e?.name !== 'AbortError') setError(e?.message || 'Failed to load repositories');
    } finally {
      setLoading(false);
    }
  }, [installationId]);

  useEffect(() => { refresh(); return () => abortRef.current?.abort(); }, [refresh]);

  return { repos, loading, error, refresh };
}

export function useRepoBranches(installationId: string | null, repoFullName: string | null) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (!installationId || !repoFullName) { setBranches([]); return; }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    setError(undefined);
    try {
      const res = await fetch(`/api/installations/branches?installation_id=${installationId}&repo=${encodeURIComponent(repoFullName)}`, { signal: ac.signal, cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to load branches (${res.status})`);
      const data = await res.json();
      setBranches(data.data?.branches || []);
    } catch (e:any) {
      if (e?.name !== 'AbortError') setError(e?.message || 'Failed to load branches');
    } finally {
      setLoading(false);
    }
  }, [installationId, repoFullName]);

  useEffect(() => { refresh(); return () => abortRef.current?.abort(); }, [refresh]);

  return { branches, loading, error, refresh };
}

interface Installation {
  id: string;
  installation_id: string;
  account_login: string;
  account_type: string;
  repository_selection: string;
}

interface InstallationsContextType {
  installations: Installation[];
  hasInstallations: boolean;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const InstallationsContext = createContext<InstallationsContextType | null>(null);

export function InstallationsProvider({ children }: { children: React.ReactNode }) {
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInstallations = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const res = await fetch("/api/installations/check");
      
      if (!res.ok) {
        throw new Error(`Failed to check installations: ${res.status}`);
      }
      
      const data = await res.json();
      const installationsList = data.data?.installations || [];
      
      setInstallations(installationsList);
    } catch (err) {
      console.error("Failed to fetch installations:", err);
      setError(err instanceof Error ? err.message : "Failed to check installations");
      setInstallations([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInstallations();
  }, []);

  const value: InstallationsContextType = {
    installations,
    hasInstallations: installations.length > 0,
    isLoading,
    error,
    refetch: fetchInstallations,
  };

  return (
    <InstallationsContext.Provider value={value}>
      {children}
    </InstallationsContext.Provider>
  );
}

export function useInstallations() {
  const context = useContext(InstallationsContext);
  if (!context) {
    throw new Error("useInstallations must be used within an InstallationsProvider");
  }
  return context;
}
