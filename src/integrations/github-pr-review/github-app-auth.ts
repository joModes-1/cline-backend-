/**
 * GitHub App authentication — JWT generation + installation-token minting.
 *
 * No octokit / no third-party JWT lib. Pure Node `crypto`. ~80 lines.
 *
 * Flow:
 *   1. Generate an App JWT (RS256, signed with the App's PEM private key,
 *      iss = App ID, lifespan ≤ 10 min).
 *   2. POST /app/installations/{installation_id}/access_tokens with the JWT
 *      to mint a short-lived installation token (lasts 1 hour).
 *   3. Use that token as a Bearer for API calls scoped to the installed repo.
 *
 * Installation tokens are cached in-memory until they're within 5 min of
 * expiry, so we don't mint a new one for every webhook event.
 */

import * as crypto from 'node:crypto'

function base64UrlEncode(input: string | Buffer): string {
  const b = typeof input === 'string' ? Buffer.from(input) : input
  return b.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

/**
 * Mint an App JWT. Lives at most 10 minutes per GitHub's spec — we use 9 min
 * to leave a 60s safety margin against clock skew.
 */
export function mintAppJwt(opts: { appId: string | number; privateKeyPem: string }): string {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    // iat backdated 60s to absorb clock skew between us and GitHub.
    iat: now - 60,
    exp: now + 9 * 60,
    iss: String(opts.appId),
  }
  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`
  const signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput), opts.privateKeyPem)
  return `${signingInput}.${base64UrlEncode(signature)}`
}

// ─── Installation-token cache ───────────────────────────────────────────────
// Installation IDs are unique per (App, repo-owner). Tokens last 1 hour.
// We refresh when within 5 minutes of expiry.
interface CachedToken {
  token: string
  expiresAtSec: number
}
const tokenCache = new Map<number, CachedToken>()

const TOKEN_REFRESH_MARGIN_SEC = 5 * 60

export async function getInstallationToken(opts: {
  appId: string | number
  privateKeyPem: string
  installationId: number
}): Promise<string> {
  const cached = tokenCache.get(opts.installationId)
  const nowSec = Math.floor(Date.now() / 1000)
  if (cached && cached.expiresAtSec - nowSec > TOKEN_REFRESH_MARGIN_SEC) {
    return cached.token
  }

  const appJwt = mintAppJwt({ appId: opts.appId, privateKeyPem: opts.privateKeyPem })
  const res = await fetch(
    `https://api.github.com/app/installations/${opts.installationId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${appJwt}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'villa-pr-reviewer',
      },
    },
  )
  if (!res.ok) {
    const body = await res.text().catch(() => '<no body>')
    throw new Error(
      `Failed to mint installation token for installation ${opts.installationId}: ${res.status} ${body.slice(0, 200)}`,
    )
  }
  const data = (await res.json()) as { token: string; expires_at: string }
  const expiresAtSec = Math.floor(new Date(data.expires_at).getTime() / 1000)
  tokenCache.set(opts.installationId, { token: data.token, expiresAtSec })
  return data.token
}

/** Test-only helper to wipe the cache between runs. */
export function _resetTokenCacheForTesting(): void {
  tokenCache.clear()
}
