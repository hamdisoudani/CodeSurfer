// Lightweight GitHub App helper to mint installation access tokens
// Requires envs: GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY (PEM with real or \n-escaped newlines)
// Optional: GITHUB_INSTALLATION_ID (fallback if not passed to the function)
import { createAppAuth } from "@octokit/auth-app";

let cachedPrivateKey: string | undefined;

function getPrivateKeyFromEnv(): string | undefined {
  if (cachedPrivateKey) return cachedPrivateKey;
  const raw = process.env.GITHUB_APP_PRIVATE_KEY;
  if (!raw) return undefined;

  // Accept raw PEM, base64-encoded PEM, and \n-escaped PEM
  let keyCandidate = raw;
  if (!raw.startsWith("-----BEGIN")) {
    try {
      const decoded = Buffer.from(raw, "base64").toString("utf8");
      if (decoded && decoded.includes("-----BEGIN")) keyCandidate = decoded;
    } catch {
      // not base64; keep raw
    }
  }
  // Normalize escaped newlines if present
  if (keyCandidate.includes("\\n") && !keyCandidate.includes("\n")) {
    keyCandidate = keyCandidate.replace(/\\n/g, "\n");
  }
  cachedPrivateKey = keyCandidate;
  return cachedPrivateKey;
}

export async function getInstallationAccessToken(installationId?: string | number): Promise<string | undefined> {
  const id = installationId ?? process.env.GITHUB_INSTALLATION_ID;
  console.log("installationId", id)
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = getPrivateKeyFromEnv();
  if (!id || !appId || !privateKey) return undefined;
  console.log("appId", appId)
  console.log("privateKey", privateKey)
  try {
    const auth = createAppAuth({
      appId: Number(appId),
      privateKey,
      installationId: Number(id),
    });
    const authentication = await auth({ type: "installation" });
    const token = (authentication as any)?.token as string | undefined;
    console.log("token", token)
    return token;
  } catch {
    console.log("error")
    return undefined;
  }
}


