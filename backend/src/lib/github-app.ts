import { App } from "octokit";

let cachedApp: any | undefined;

function normalizePrivateKey(raw?: string): string | undefined {
  if (!raw) return undefined;
  let key = raw;
  // Support base64-encoded
  if (!key.startsWith('-----BEGIN')) {
    try {
      const decoded = Buffer.from(key, 'base64').toString('utf8');
      if (decoded.includes('-----BEGIN')) key = decoded;
    } catch {}
  }
  // Support \n-escaped
  if (key.includes('\\n') && !key.includes('\n')) {
    key = key.replace(/\\n/g, '\n');
  }
  return key;
}

export async function getGithubApp(): Promise<any> {
  if (cachedApp) return cachedApp;
  const appId = process.env.GITHUB_APP_ID as string | undefined;
  const pk = normalizePrivateKey(process.env.GITHUB_APP_PRIVATE_KEY);
  if (!appId || !pk) throw new Error('GitHub App not configured');
  
  //const { App } = await import('@octokit/app');
  cachedApp = new App({ appId, privateKey: pk });
  return cachedApp;
}

export async function getInstallationOctokit(installationId: number): Promise<any | undefined> {
  const app = await getGithubApp();
  try {
    const client = await app.getInstallationOctokit(installationId);
    return client;
  } catch {
    return undefined;
  }
}


