/**
 * @villa/github-pr-review — public surface.
 *
 * One factory function. Pass your config + a validator. Get back an
 * Express router. Mount it. Done.
 *
 *   import { createGitHubPRReviewer } from './integrations/github-pr-review'
 *
 *   const reviewer = createGitHubPRReviewer({
 *     appId:        process.env.GITHUB_APP_ID!,
 *     privateKey:   process.env.GITHUB_APP_PRIVATE_KEY!,    // PEM string
 *     webhookSecret: process.env.GITHUB_WEBHOOK_SECRET!,
 *     validate:     async ({ path, content, changedLines }) => {
 *       // Your code-review logic goes here. Return PRReviewFinding[].
 *       return []
 *     },
 *     checkName:    'Villa AI',           // optional
 *     maxFilesPerPR: 50,                  // optional
 *   })
 *
 *   app.use('/api/github-pr', reviewer.router)
 *
 * That's the whole integration. Webhook URL on GitHub:
 *   https://your.host/api/github-pr/webhook
 */

import type { GitHubPRReviewerConfig, PRReviewJob, Logger } from './types'
import { createWebhookRouter } from './webhook-router'
import { runPRReview, type RunReviewInput } from './pr-review-pipeline'

export interface GitHubPRReviewer {
  /** Mount this on your Express app. Owns /webhook and /health. */
  router: import('express').Router
  /** Run a review manually (e.g. from a test or admin endpoint). */
  reviewPR: (input: RunReviewInput) => ReturnType<typeof runPRReview>
  /** Inspect the in-process queue (length, head, processing flag). */
  inspectQueue: () => { length: number; processing: boolean; head?: PRReviewJob }
}

export function createGitHubPRReviewer(cfg: GitHubPRReviewerConfig): GitHubPRReviewer {
  validateConfig(cfg)
  const { router, queue } = createWebhookRouter(cfg)
  return {
    router,
    reviewPR: (input) => runPRReview(cfg, input),
    inspectQueue: () => queue.inspect(),
  }
}

function validateConfig(cfg: GitHubPRReviewerConfig): void {
  const missing: string[] = []
  if (!cfg.appId) missing.push('appId')
  if (!cfg.privateKey) missing.push('privateKey')
  if (!cfg.webhookSecret) missing.push('webhookSecret')
  if (typeof cfg.validate !== 'function') missing.push('validate (function)')
  if (missing.length > 0) {
    throw new Error(
      `[github-pr-review] Missing required config: ${missing.join(', ')}.\n` +
        `See ./README.md for setup instructions.`,
    )
  }
  if (!cfg.privateKey.includes('-----BEGIN')) {
    throw new Error(
      `[github-pr-review] privateKey doesn't look like a PEM. ` +
        `Did you forget to replace \\n with real newlines? GitHub Apps download a *.pem file.`,
    )
  }
}

// ─── Re-exports so consumers can write their validators typed ────────────────
export type {
  GitHubPRReviewerConfig,
  PRReviewFinding,
  FindingSeverity,
  ValidateFn,
  ValidateInput,
  PRReviewResult,
  PRReviewJob,
  Logger,
} from './types'
