/**
 * Public types for the GitHub PR Review module.
 *
 * Zero imports — this file is the contract between the host project and the
 * pipeline. Copy this directory anywhere and the only thing that changes
 * is the `validate` function you pass in.
 */

// ─── Finding shape the validator must produce ───────────────────────────────
// Designed to be a strict subset of the typical compliance/code-review
// finding shapes so any existing validator can adapt to it with minimal work.
export type FindingSeverity = 'error' | 'warning' | 'info'

export interface PRReviewFinding {
  /** Stable identifier for de-duplication. */
  id?: string
  /** What's wrong, one line. Appears on the inline PR comment. */
  message: string
  /** Severity → emoji + label on the comment. */
  severity: FindingSeverity
  /** 1-indexed line in the NEW (post-PR) file. Required to post inline. */
  line: number
  /** Optional: column. */
  column?: number
  /** Optional: rule slug, e.g. "security/sql-injection". */
  ruleId?: string
  /** Optional: free-form category. */
  category?: string
  /** Optional: store policy reference, e.g. "App Store Guideline 3.1.1". */
  storeRule?: string
  /**
   * Optional: GitHub-suggestion-block replacement for the flagged line(s).
   * If present, the comment will include a ```suggestion``` block so the
   * reviewer can click "Apply suggestion" inside GitHub.
   */
  suggestion?: string
  /** Optional: longer human explanation, appended below the message. */
  description?: string
}

// ─── What the host's validator must implement ───────────────────────────────
export interface ValidateInput {
  /** Relative path inside the repo, e.g. "src/auth.ts". */
  path: string
  /** Full content of the file at the head of the PR. */
  content: string
  /**
   * Lines that the PR touched (1-indexed, in the NEW file). Helpful when
   * the validator only wants to report on changed code, not the whole file.
   * Empty array = file is new.
   */
  changedLines: number[]
  /** Repo full name, e.g. "owner/repo". */
  repo: string
  /** Branch the PR is merging into. */
  baseBranch: string
  /** Branch the PR is coming from. */
  headBranch: string
  /** PR number. */
  prNumber: number
}

export type ValidateFn = (input: ValidateInput) => Promise<PRReviewFinding[]>

// ─── Module configuration ───────────────────────────────────────────────────
export interface GitHubPRReviewerConfig {
  /** GitHub App "App ID" (numeric, shown on the app's settings page). */
  appId: string | number
  /** GitHub App private key (PEM string). */
  privateKey: string
  /** Webhook secret used to HMAC-sign incoming events. */
  webhookSecret: string
  /** Host's validator. Called once per changed file. */
  validate: ValidateFn
  /** Label that appears in the PR's checks list. Defaults to "AI Review". */
  checkName?: string
  /**
   * Optional: cap how many files we review per PR (to control AI cost and
   * latency). Files beyond this limit are skipped and noted in the summary.
   */
  maxFilesPerPR?: number
  /**
   * Optional: skip files matching these extensions / patterns. Defaults to
   * common binary / vendored / lock files.
   */
  skipFilePatterns?: RegExp[]
  /** Optional logger. Falls back to console. */
  logger?: Logger
}

export interface Logger {
  info: (msg: string, ...args: unknown[]) => void
  warn: (msg: string, ...args: unknown[]) => void
  error: (msg: string, ...args: unknown[]) => void
  debug: (msg: string, ...args: unknown[]) => void
}

// ─── Internal types — exported so the host can inspect the queue state ──────
export interface PRReviewJob {
  installationId: number
  repoFullName: string
  prNumber: number
  prHeadSha: string
  enqueuedAt: number
}

export interface PRReviewResult {
  reviewed: number
  skipped: number
  findingsTotal: number
  findingsBySeverity: Record<FindingSeverity, number>
  durationMs: number
  checkRunId?: number
  reviewId?: number
}
