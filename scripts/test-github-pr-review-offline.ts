/**
 * Offline unit-style test for the github-pr-review module.
 *
 * Verifies the two pieces with non-trivial logic (no network needed):
 *   1. extractCommentableLines() — unified-diff parser.
 *   2. formatReview() — findings → GitHub review payload.
 *   3. verifyGitHubSignature() — HMAC signature verification.
 *
 * Run: npx tsx scripts/test-github-pr-review-offline.ts
 */

import * as crypto from 'node:crypto'
import { extractCommentableLines } from '../src/integrations/github-pr-review/diff-extractor'
import { formatReview } from '../src/integrations/github-pr-review/review-formatter'
import { verifyGitHubSignature } from '../src/integrations/github-pr-review/webhook-verify'
import type { PRReviewFinding } from '../src/integrations/github-pr-review/types'

function assertEq(actual: any, expected: any, msg: string): void {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) {
    console.error(`  ✗ FAIL: ${msg}\n    expected: ${e}\n    actual:   ${a}`)
    process.exit(1)
  }
  console.log(`  ✓ ${msg}`)
}

function assertTrue(cond: any, msg: string): void {
  if (!cond) {
    console.error(`  ✗ FAIL: ${msg}`)
    process.exit(1)
  }
  console.log(`  ✓ ${msg}`)
}

const line = '═'.repeat(60)
console.log(`\n${line}\n  github-pr-review offline tests\n${line}\n`)

// ─── 1. diff-extractor ─────────────────────────────────────────────────────
console.log('[1/3] extractCommentableLines()')
{
  const patch = [
    '@@ -10,7 +10,9 @@ function foo() {',
    '   const a = 1',
    '-  const b = 2',
    '+  const b = 3',
    '+  const c = 4',
    '   return a',
    ' }',
    ' ',
    '@@ -30,2 +32,3 @@',
    '   x()',
    '+  y()',
    '   z()',
  ].join('\n')
  const r = extractCommentableLines(patch)
  // First hunk new-side: starts at line 10. Lines after parsing:
  //   10  const a = 1          (context)
  //   11  const b = 3          (added)
  //   12  const c = 4          (added)
  //   13  return a             (context)
  //   14  }                    (context)
  //   15                       (context, blank)
  // Second hunk new-side: starts at line 32.
  //   32  x()                  (context)
  //   33  y()                  (added)
  //   34  z()                  (context)
  assertEq(
    Array.from(r.lines).sort((a, b) => a - b),
    [10, 11, 12, 13, 14, 15, 32, 33, 34],
    'commentable lines span both hunks (context + added)',
  )
  assertEq(
    Array.from(r.added).sort((a, b) => a - b),
    [11, 12, 33],
    'added-only set excludes context lines',
  )
}
{
  // Missing patch → empty result.
  const r = extractCommentableLines(undefined)
  assertEq(r.lines.size, 0, 'undefined patch yields no commentable lines')
}
{
  // Single-line addition at start of file.
  const patch = '@@ -0,0 +1,1 @@\n+console.log("new file")'
  const r = extractCommentableLines(patch)
  assertEq([...r.added], [1], 'new file line 1 is added')
}

// ─── 2. review-formatter ──────────────────────────────────────────────────
console.log('\n[2/3] formatReview()')
{
  const map = new Map<string, PRReviewFinding[]>()
  map.set('src/auth.ts', [
    {
      message: 'Hardcoded JWT secret',
      severity: 'error',
      line: 7,
      ruleId: 'security/hardcoded-secret',
      suggestion: "const JWT_SECRET = process.env.JWT_SECRET;",
    },
    {
      message: 'Missing input validation',
      severity: 'warning',
      line: 15,
    },
  ])
  map.set('src/db.ts', [
    {
      message: 'No env-var validation',
      severity: 'info',
      line: 5,
    },
  ])

  const r = formatReview({
    findingsByFile: map,
    totalFilesReviewed: 2,
    totalFilesSkipped: 1,
    appLabel: 'Villa AI',
  })

  assertEq(r.inlineComments.length, 3, 'one inline comment per (file, line)')
  assertEq(r.checkConclusion, 'failure', 'any error → check conclusion failure')
  assertEq(r.reviewEvent, 'REQUEST_CHANGES', 'any error → review event REQUEST_CHANGES')

  assertTrue(
    r.reviewBody.includes('## Villa AI Review'),
    'review body has the app label heading',
  )
  assertTrue(
    r.reviewBody.includes('🔴 Error'),
    'review body summarises errors',
  )
  assertTrue(
    r.inlineComments.some((c) => c.body.includes('```suggestion')),
    'inline comment contains a GitHub suggestion block',
  )
}
{
  // No findings → success conclusion, COMMENT event, no inline comments.
  const r = formatReview({
    findingsByFile: new Map(),
    totalFilesReviewed: 5,
    totalFilesSkipped: 0,
    appLabel: 'Villa AI',
  })
  assertEq(r.inlineComments.length, 0, 'no findings → no inline comments')
  assertEq(r.checkConclusion, 'success', 'no findings → check conclusion success')
  assertEq(r.reviewEvent, 'COMMENT', 'no findings → review event COMMENT')
  assertTrue(r.reviewBody.includes('No issues found'), 'review body says "No issues found"')
}
{
  // Multiple findings on the same line → merged into ONE comment with bullets.
  const map = new Map<string, PRReviewFinding[]>()
  map.set('src/foo.ts', [
    { message: 'Issue A', severity: 'warning', line: 10 },
    { message: 'Issue B', severity: 'error', line: 10 },
  ])
  const r = formatReview({
    findingsByFile: map,
    totalFilesReviewed: 1,
    totalFilesSkipped: 0,
    appLabel: 'Villa AI',
  })
  assertEq(r.inlineComments.length, 1, 'two findings same line → one inline comment')
  assertTrue(
    r.inlineComments[0].body.includes('Issue A') && r.inlineComments[0].body.includes('Issue B'),
    'merged comment contains both messages',
  )
}

// ─── 3. webhook-verify ────────────────────────────────────────────────────
console.log('\n[3/3] verifyGitHubSignature()')
{
  const secret = 's3cret-w3bhook'
  const body = '{"action":"opened","pull_request":{"number":42}}'
  const correctSig = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex')

  assertTrue(
    verifyGitHubSignature({ secret, signatureHeader: correctSig, rawBody: body }),
    'correct HMAC passes',
  )
  assertTrue(
    !verifyGitHubSignature({ secret, signatureHeader: 'sha256=deadbeef', rawBody: body }),
    'wrong HMAC rejected',
  )
  assertTrue(
    !verifyGitHubSignature({ secret, signatureHeader: undefined, rawBody: body }),
    'missing header rejected',
  )
  assertTrue(
    !verifyGitHubSignature({ secret, signatureHeader: 'sha1=oldformat', rawBody: body }),
    'sha1 prefix rejected (we only accept sha256)',
  )
  assertTrue(
    !verifyGitHubSignature({ secret: 'wrong-secret', signatureHeader: correctSig, rawBody: body }),
    'wrong secret rejected',
  )
}

console.log(`\n${line}\n  ALL TESTS PASS\n${line}\n`)
