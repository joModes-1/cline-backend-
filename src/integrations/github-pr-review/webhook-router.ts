/**
 * Express router that owns the GitHub webhook endpoint.
 *
 * Mount once:
 *   app.use('/api/github-pr', reviewer.router)
 *
 * GitHub will POST events to {your-host}/api/github-pr/webhook. The router:
 *
 *   1. Verifies the X-Hub-Signature-256 HMAC.
 *   2. Acks fast (200 within ~5s — GitHub retries otherwise).
 *   3. Enqueues a review job for async processing.
 *
 * The queue is a tiny in-process FIFO. For production multi-instance setups
 * you'd want BullMQ / Redis; the contract here is small enough to swap.
 */

import { Router, type Request, type Response } from 'express'
import type { GitHubPRReviewerConfig, Logger, PRReviewJob } from './types'
import { verifyGitHubSignature } from './webhook-verify'
import { runPRReview } from './pr-review-pipeline'

const RELEVANT_PR_ACTIONS = new Set([
  'opened',
  'synchronize',     // new commits pushed
  'reopened',
  'ready_for_review',
])

/**
 * In-process serial queue. Processes one job at a time so we never overlap
 * runs for the same PR (which would create duplicate reviews).
 *
 * For real production: replace with BullMQ.
 */
class InProcessQueue {
  private queue: PRReviewJob[] = []
  private processing = false
  // Coalesce: drop earlier jobs for the same (repo, PR) when a newer one
  // arrives — only the latest head SHA matters.
  enqueue(job: PRReviewJob): void {
    const dupIdx = this.queue.findIndex(
      (j) => j.repoFullName === job.repoFullName && j.prNumber === job.prNumber,
    )
    if (dupIdx !== -1) {
      this.queue.splice(dupIdx, 1)
    }
    this.queue.push(job)
  }

  async drain(
    handler: (job: PRReviewJob) => Promise<void>,
    log: Logger,
  ): Promise<void> {
    if (this.processing) return
    this.processing = true
    try {
      while (this.queue.length > 0) {
        const job = this.queue.shift()!
        try {
          await handler(job)
        } catch (err) {
          log.error(`[github-pr-review] Job failed for ${job.repoFullName}#${job.prNumber}: ${(err as Error).message}`)
        }
      }
    } finally {
      this.processing = false
    }
  }

  inspect(): { length: number; processing: boolean; head?: PRReviewJob } {
    return { length: this.queue.length, processing: this.processing, head: this.queue[0] }
  }
}

export function createWebhookRouter(
  cfg: GitHubPRReviewerConfig,
): { router: Router; queue: InProcessQueue } {
  const log = cfg.logger ?? defaultLogger
  const router = Router()
  const queue = new InProcessQueue()

  // GitHub needs the RAW body to verify the HMAC. The host app's
  // `express.json()` middleware MUST be configured with a `verify` callback
  // that stashes the original buffer on `req.rawBody` — see README. We do
  // NOT attach our own stream reader here because by the time this route
  // runs, the body stream has already been drained by the parser.
  router.post(
    '/webhook',
    async (req: Request, res: Response) => {
      const rawBody: Buffer =
        (req as any).rawBody instanceof Buffer
          ? (req as any).rawBody
          : Buffer.from(JSON.stringify(req.body ?? {}), 'utf-8')
      const sig = req.header('x-hub-signature-256') ?? undefined

      // Escape hatch: GITHUB_WEBHOOK_SKIP_VERIFY=true skips HMAC verification.
      // Useful ONLY for local dev when you can't get the secret-sides to match
      // (typical localtunnel/smee dance, or GitHub's secret field getting confused
      // with the Client Secret field). NEVER set this in production — anyone who
      // knows the webhook URL could forge events.
      const skipVerify = process.env.GITHUB_WEBHOOK_SKIP_VERIFY === 'true'
      if (skipVerify) {
        log.warn(
          '[github-pr-review] ⚠ Signature verification DISABLED via GITHUB_WEBHOOK_SKIP_VERIFY. ' +
            'Acceptable for local dev only — re-enable before exposing this endpoint publicly.',
        )
      } else if (!verifyGitHubSignature({ secret: cfg.webhookSecret, signatureHeader: sig, rawBody })) {
        try {
          const crypto = await import('node:crypto')
          const computed = 'sha256=' + crypto.createHmac('sha256', cfg.webhookSecret).update(rawBody).digest('hex')
          log.warn(
            `[github-pr-review] Webhook rejected: bad signature. ` +
              `expected=${computed.slice(0, 19)}… got=${(sig ?? '<none>').slice(0, 19)}… ` +
              `secret_len=${cfg.webhookSecret.length} body_len=${rawBody.length}`,
          )
        } catch {
          log.warn('[github-pr-review] Webhook rejected: bad signature')
        }
        res.status(401).json({ ok: false, error: 'bad signature' })
        return
      }

      const event = req.header('x-github-event') ?? 'unknown'
      // The host's express.json() already parsed the payload onto req.body.
      const body = (req.body ?? null) as Record<string, any> | null

      if (event === 'ping') {
        log.info('[github-pr-review] Ping received')
        res.json({ ok: true, pong: true })
        return
      }

      if (event !== 'pull_request') {
        // Acknowledge but ignore — we don't care about other event types yet.
        res.json({ ok: true, ignored: event })
        return
      }

      const action = body?.action as string | undefined
      if (!action || !RELEVANT_PR_ACTIONS.has(action)) {
        res.json({ ok: true, ignored_action: action })
        return
      }

      const installationId = body?.installation?.id as number | undefined
      const repoFullName = body?.repository?.full_name as string | undefined
      const prNumber = body?.pull_request?.number as number | undefined
      const headSha = body?.pull_request?.head?.sha as string | undefined

      if (!installationId || !repoFullName || !prNumber || !headSha) {
        log.warn(`[github-pr-review] Malformed PR payload (event=${event} action=${action})`)
        res.status(400).json({ ok: false, error: 'missing required PR fields' })
        return
      }

      // Ack FAST. Anything beyond this point is async — GitHub will retry if
      // we take longer than ~10 s.
      res.json({ ok: true, queued: true, repo: repoFullName, pr: prNumber })

      queue.enqueue({
        installationId,
        repoFullName,
        prNumber,
        prHeadSha: headSha,
        enqueuedAt: Date.now(),
      })
      // Fire-and-forget drain. The InProcessQueue is reentrancy-safe.
      void queue.drain(async (job) => {
        await runPRReview(cfg, {
          installationId: job.installationId,
          repoFullName: job.repoFullName,
          prNumber: job.prNumber,
        })
      }, log)
    },
  )

  // ── Health + queue inspection — handy during setup ──
  router.get('/health', (_req, res) => {
    res.json({ ok: true, queue: queue.inspect() })
  })

  return { router, queue }
}

const defaultLogger: Logger = {
  info: (m, ...a) => console.log(m, ...a),
  warn: (m, ...a) => console.warn(m, ...a),
  error: (m, ...a) => console.error(m, ...a),
  debug: (m, ...a) => process.env.DEBUG ? console.debug(m, ...a) : undefined,
}
