/**
 * The orchestrator. Given a PR event, run end-to-end:
 *
 *   1. Authenticate as the GitHub App installation on this repo.
 *   2. List the PR's changed files.
 *   3. For each file (skipping vendored / lock / binary / oversized):
 *      a. Fetch its content at the PR head SHA.
 *      b. Parse the unified-diff patch → set of commentable line numbers.
 *      c. Call the host's `validate(...)` function on the file.
 *      d. Drop findings whose `line` isn't in the commentable set (GitHub
 *         rejects the WHOLE review if any inline comment is on a line
 *         outside the diff).
 *   4. Format → post one PR review (inline comments + summary) + one check run.
 *
 * Designed to be called from the webhook handler. Idempotent: if you call it
 * twice for the same PR head SHA, you'll get two reviews — the caller is
 * responsible for deduping if that matters (e.g. via the queue).
 */

import type {
  GitHubPRReviewerConfig,
  PRReviewFinding,
  PRReviewResult,
  Logger,
} from './types'
import { GitHubClient } from './github-client'
import { extractCommentableLines } from './diff-extractor'
import { formatReview } from './review-formatter'

const DEFAULT_SKIP_PATTERNS: RegExp[] = [
  // Lockfiles / vendored
  /(^|\/)package-lock\.json$/i,
  /(^|\/)yarn\.lock$/i,
  /(^|\/)pnpm-lock\.yaml$/i,
  /(^|\/)Gemfile\.lock$/i,
  /(^|\/)Cargo\.lock$/i,
  /(^|\/)poetry\.lock$/i,
  /(^|\/)go\.sum$/i,
  /(^|\/)composer\.lock$/i,
  // Common vendored / generated paths
  /^node_modules\//,
  /^vendor\//,
  /^\.next\//,
  /^dist\//,
  /^build\//,
  // Binary / asset extensions
  /\.(png|jpg|jpeg|gif|webp|ico|svg|woff2?|ttf|otf|eot|mp3|mp4|mov|webm|wasm|zip|tar\.gz|tgz|gz|exe|bin|dll|so|dylib|class|jar)$/i,
  // Minified / source maps
  /\.min\.(js|css)$/i,
  /\.(js|css)\.map$/i,
]

const MAX_FILE_SIZE_BYTES = 256 * 1024   // 256KB — anything bigger is probably generated

export interface RunReviewInput {
  installationId: number
  repoFullName: string                   // "owner/repo"
  prNumber: number
}

export async function runPRReview(
  cfg: GitHubPRReviewerConfig,
  input: RunReviewInput,
): Promise<PRReviewResult> {
  const start = Date.now()
  const log = cfg.logger ?? consoleLogger
  const appLabel = cfg.checkName ?? 'AI Review'

  const client = new GitHubClient(
    {
      appId: cfg.appId,
      privateKeyPem: cfg.privateKey,
      installationId: input.installationId,
    },
    input.repoFullName,
  )

  const pr = await client.getPullRequest(input.prNumber)
  log.info(`[github-pr-review] Reviewing ${input.repoFullName}#${pr.number} @ ${pr.head.sha.slice(0, 7)}`)

  // ── Status check: in_progress ──
  // We create the check run up-front so the PR shows "AI Review in progress" the
  // moment the webhook fires. If anything below throws, we still leave a visible
  // marker rather than silently dropping the event.
  let checkRunId: number | undefined
  try {
    const cr = await client.createCheckRun({
      name: appLabel,
      headSha: pr.head.sha,
      status: 'in_progress',
      title: `${appLabel} is reviewing this PR…`,
      summary: 'Analyzing changed files.',
    })
    checkRunId = cr.id
  } catch (err) {
    // Check Run create can fail if the App lacks `checks:write` — don't block
    // the rest of the review on it.
    log.warn(`[github-pr-review] Could not create check run: ${(err as Error).message}`)
  }

  // ── Walk changed files ──
  const allFiles = await client.listChangedFiles(pr.number)
  const skipPatterns = (cfg.skipFilePatterns ?? []).concat(DEFAULT_SKIP_PATTERNS)
  const maxFiles = cfg.maxFilesPerPR ?? 100

  const findingsByFile = new Map<string, PRReviewFinding[]>()
  let reviewed = 0
  let skipped = 0

  for (const file of allFiles) {
    if (reviewed >= maxFiles) {
      skipped++
      continue
    }
    if (file.status === 'removed') {
      skipped++
      continue
    }
    if (skipPatterns.some((re) => re.test(file.filename))) {
      log.debug(`[github-pr-review] Skip (pattern): ${file.filename}`)
      skipped++
      continue
    }
    if (!file.patch) {
      // GitHub omits patch on very large or binary files — nothing to comment on.
      log.debug(`[github-pr-review] Skip (no patch): ${file.filename}`)
      skipped++
      continue
    }

    const content = await client.getFileContentAtRef(file.filename, pr.head.sha)
    if (content == null) {
      log.debug(`[github-pr-review] Skip (no content): ${file.filename}`)
      skipped++
      continue
    }
    if (content.length > MAX_FILE_SIZE_BYTES) {
      log.debug(`[github-pr-review] Skip (too big: ${content.length} bytes): ${file.filename}`)
      skipped++
      continue
    }

    const range = extractCommentableLines(file.patch)
    const changedLines = Array.from(range.added).sort((a, b) => a - b)

    let raw: PRReviewFinding[]
    try {
      raw = await cfg.validate({
        path: file.filename,
        content,
        changedLines,
        repo: input.repoFullName,
        baseBranch: pr.base.ref,
        headBranch: pr.head.ref,
        prNumber: pr.number,
      })
    } catch (err) {
      log.error(`[github-pr-review] Validator threw on ${file.filename}: ${(err as Error).message}`)
      reviewed++
      continue
    }

    // CRITICAL: drop findings whose line isn't in the diff. GitHub rejects the
    // entire review (with all comments) if any one comment is off-diff.
    const filtered = raw.filter((f) => range.lines.has(f.line))
    if (raw.length !== filtered.length) {
      log.debug(`[github-pr-review] ${file.filename}: ${raw.length - filtered.length} finding(s) dropped — outside PR diff`)
    }
    if (filtered.length > 0) findingsByFile.set(file.filename, filtered)
    reviewed++
  }

  // ── Format + post ──
  const formatted = formatReview({
    findingsByFile,
    totalFilesReviewed: reviewed,
    totalFilesSkipped: skipped,
    appLabel,
  })

  let reviewId: number | undefined
  if (formatted.inlineComments.length > 0 || formatted.reviewBody) {
    try {
      const review = await client.postReview({
        prNumber: pr.number,
        commitId: pr.head.sha,
        body: formatted.reviewBody,
        event: formatted.inlineComments.length > 0 ? formatted.reviewEvent : 'COMMENT',
        comments: formatted.inlineComments,
      })
      reviewId = review.id
    } catch (err) {
      // If the review post fails (most common cause: one of our line numbers
      // wasn't really in the diff), fall back to a summary-only review with
      // no inline comments. Logs the original error so we can fix our filter.
      log.error(`[github-pr-review] Inline review failed, falling back to summary: ${(err as Error).message}`)
      try {
        const review = await client.postReview({
          prNumber: pr.number,
          commitId: pr.head.sha,
          body: formatted.reviewBody,
          event: 'COMMENT',
          comments: [],
        })
        reviewId = review.id
      } catch (err2) {
        log.error(`[github-pr-review] Fallback summary review also failed: ${(err2 as Error).message}`)
      }
    }
  }

  // ── Complete the check run ──
  if (checkRunId !== undefined) {
    try {
      await client.updateCheckRun(checkRunId, {
        status: 'completed',
        conclusion: formatted.checkConclusion,
        title:
          formatted.checkConclusion === 'success'
            ? `${appLabel} — Passed`
            : formatted.checkConclusion === 'failure'
              ? `${appLabel} — Issues Found`
              : `${appLabel} — Comments`,
        summary: formatted.checkSummary,
        detailsText: formatted.checkDetails,
      })
    } catch (err) {
      log.warn(`[github-pr-review] Could not complete check run ${checkRunId}: ${(err as Error).message}`)
    }
  }

  const findingsTotal = Array.from(findingsByFile.values()).reduce((s, arr) => s + arr.length, 0)
  const findingsBySeverity = { error: 0, warning: 0, info: 0 }
  for (const arr of findingsByFile.values()) {
    for (const f of arr) findingsBySeverity[f.severity]++
  }

  const result: PRReviewResult = {
    reviewed,
    skipped,
    findingsTotal,
    findingsBySeverity,
    durationMs: Date.now() - start,
    checkRunId,
    reviewId,
  }
  log.info(
    `[github-pr-review] Done ${input.repoFullName}#${pr.number}: ${reviewed} reviewed, ${skipped} skipped, ${findingsTotal} findings in ${result.durationMs}ms`,
  )
  return result
}

const consoleLogger: Logger = {
  info: (m, ...a) => console.log(m, ...a),
  warn: (m, ...a) => console.warn(m, ...a),
  error: (m, ...a) => console.error(m, ...a),
  debug: (m, ...a) => process.env.DEBUG ? console.debug(m, ...a) : undefined,
}
