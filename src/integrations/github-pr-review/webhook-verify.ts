/**
 * GitHub webhook signature verification.
 *
 * GitHub signs every webhook payload with HMAC-SHA256 using the secret you
 * configured on the App. The signature arrives in the `X-Hub-Signature-256`
 * header as `sha256=<hex>`. We MUST verify it before doing anything with
 * the body — otherwise anyone who knows the URL can fire fake PR events.
 *
 * Constant-time comparison via crypto.timingSafeEqual to avoid timing attacks.
 */

import * as crypto from 'node:crypto'

/**
 * @returns true if the signature matches the secret + body, false otherwise.
 */
export function verifyGitHubSignature(opts: {
  secret: string
  signatureHeader: string | undefined
  rawBody: Buffer | string
}): boolean {
  const { secret, signatureHeader, rawBody } = opts
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false
  const expected = crypto
    .createHmac('sha256', secret)
    .update(typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf-8') : rawBody)
    .digest('hex')
  const given = signatureHeader.slice('sha256='.length)
  // Both buffers MUST be the same length for timingSafeEqual, otherwise it throws.
  if (expected.length !== given.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'utf-8'), Buffer.from(given, 'utf-8'))
  } catch {
    return false
  }
}
