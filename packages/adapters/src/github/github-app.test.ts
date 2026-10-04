import { generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GitHubApp, appCredentials } from "./github-app.js";

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const credentials = { appId: "123", privateKey };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Answers token mints and one repo read; records every call. */
function fakeGitHub() {
  const calls: string[] = [];
  let minted = 0;
  const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const { pathname } = new URL(url);
    calls.push(`${init?.method ?? "GET"} ${pathname}`);
    if (pathname.endsWith("/access_tokens")) {
      minted++;
      return json({ token: `ghs_${minted}`, expires_at: new Date(Date.now() + 3_600_000).toISOString() }, 201);
    }
    return json({ authorization: new Headers(init?.headers).get("authorization") });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("appCredentials", () => {
  it("restores the newlines of a single-line, quoted PEM", () => {
    const stored = `"${privateKey.trim().replace(/\n/g, "\\n")}"`;
    expect(appCredentials("123", stored)).toEqual({ appId: "123", privateKey: privateKey.trim() });
  });

  it("names what is missing", () => {
    expect(() => appCredentials(undefined, undefined)).toThrow("GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY");
  });
});

describe("GitHubApp", () => {
  it("mints an installation token once and reuses it", async () => {
    const { fetchImpl, calls } = fakeGitHub();
    const gh = new GitHubApp(credentials, fetchImpl).forInstallation(7);
    const first = await gh.request("GET /repos/{owner}/{repo}", { owner: "acme", repo: "shop" });
    await gh.request("GET /repos/{owner}/{repo}", { owner: "acme", repo: "shop" });

    expect(first.data).toEqual({ authorization: "token ghs_1" });
    expect(calls).toEqual(["POST /app/installations/7/access_tokens", "GET /repos/acme/shop", "GET /repos/acme/shop"]);
  });

  it("mints a new token once the old one has expired", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { fetchImpl, calls } = fakeGitHub();
    const gh = new GitHubApp(credentials, fetchImpl).forInstallation(7);
    await gh.request("GET /repos/{owner}/{repo}", { owner: "acme", repo: "shop" });
    vi.setSystemTime(Date.now() + 61 * 60_000);
    const later = await gh.request("GET /repos/{owner}/{repo}", { owner: "acme", repo: "shop" });

    expect(later.data).toEqual({ authorization: "token ghs_2" });
    expect(calls.filter((c) => c.endsWith("/access_tokens"))).toHaveLength(2);
  });

  it("gives up on a request that hangs, token mint included", async () => {
    const hanging = ((_url: string | URL, init?: RequestInit) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)))) as typeof fetch;
    const gh = new GitHubApp(credentials, hanging, 50).forInstallation(7);
    await expect(gh.request("GET /repos/{owner}/{repo}", { owner: "acme", repo: "shop" })).rejects.toThrow(/abort|timeout/i);
  });

  it("keeps one octokit per installation", () => {
    const app = new GitHubApp(credentials);
    expect(app.forInstallation(1)).toBe(app.forInstallation(1));
    expect(app.forInstallation(1)).not.toBe(app.forInstallation(2));
  });
});
