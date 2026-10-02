import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";

export interface GitHubAppCredentials {
  appId: string;
  privateKey: string;
}

/** Bounds every request without a signal of its own, including the token mints auth makes. */
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY as stored in env files and Key Vault: the PEM on one
 * line with literal \n sequences, optionally quoted (the same convention as Crux).
 */
export function appCredentials(appId: string | undefined, rawKey: string | undefined): GitHubAppCredentials {
  const missing = [!appId && "GITHUB_APP_ID", !rawKey && "GITHUB_APP_PRIVATE_KEY"].filter(Boolean);
  if (missing.length > 0) throw new Error(`Missing GitHub App env vars: ${missing.join(", ")}`);
  const trimmed = rawKey!.trim();
  const quoted = /^(['"]).*\1$/s.test(trimmed);
  return { appId: appId!, privateKey: (quoted ? trimmed.slice(1, -1) : trimmed).replace(/\\n/g, "\n") };
}

/** Octokits for the GitHub App: as the app (JWT) or as one installation (token, renewed before expiry). */
export class GitHubApp {
  private readonly installations = new Map<number, Octokit>();
  private app: Octokit | null = null;

  constructor(
    private readonly credentials: GitHubAppCredentials,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {}

  /** For /app endpoints, such as the webhook deliveries. */
  asApp(): Octokit {
    this.app ??= this.octokit({});
    return this.app;
  }

  /** One per installation, so the token cache inside it is reused. */
  forInstallation(installationId: number): Octokit {
    let octokit = this.installations.get(installationId);
    if (!octokit) {
      octokit = this.octokit({ installationId });
      this.installations.set(installationId, octokit);
    }
    return octokit;
  }

  private octokit(auth: { installationId?: number }): Octokit {
    const timeoutMs = this.timeoutMs;
    const fetchImpl = this.fetchImpl;
    return new Octokit({
      authStrategy: createAppAuth,
      auth: { ...this.credentials, ...auth },
      request: {
        fetch: (url: string | URL, init: RequestInit = {}) =>
          fetchImpl(url, { ...init, signal: init.signal ?? AbortSignal.timeout(timeoutMs) }),
      },
    });
  }
}
