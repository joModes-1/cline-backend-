/**
 * Thin REST client for the subset of the GitHub API the PR-review pipeline
 * needs. No octokit — just fetch + an installation token.
 *
 * Endpoints used:
 *   GET  /repos/{owner}/{repo}/pulls/{number}                  — PR metadata
 *   GET  /repos/{owner}/{repo}/pulls/{number}/files            — changed files + patch
 *   GET  /repos/{owner}/{repo}/contents/{path}?ref={sha}        — raw file at PR head
 *   POST /repos/{owner}/{repo}/pulls/{number}/reviews           — multi-line review w/ inline comments
 *   POST /repos/{owner}/{repo}/check-runs                       — status check (✓ / ✗)
 *   PATCH /repos/{owner}/{repo}/check-runs/{id}                  — update status check
 */

import { getInstallationToken } from './github-app-auth'

export interface GitHubClientConfig {
  appId: string | number
  privateKeyPem: string
  installationId: number
}

export interface PullRequestInfo {
  number: number
  title: string
  state: 'open' | 'closed'
  base: { sha: string; ref: string }
  head: { sha: string; ref: string }
  user: { login: string }
}

export interface ChangedFile {
  filename: string
  status: 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed' | 'unchanged'
  patch?: string                  // Unified diff hunk; absent for very large or binary files
  blob_sha: string
  additions: number
  deletions: number
  changes: number
}

export type CheckRunConclusion =
  | 'success'
  | 'failure'
  | 'neutral'
  | 'cancelled'
  | 'skipped'
  | 'timed_out'
  | 'action_required'

export interface InlineComment {
  path: string
  // GitHub accepts either `position` (line number in the patch) or
  // `line` (line number in the file at PR head). We always use `line`.
  line: number
  // For multi-line comments we'd use start_line + line; not used in MVP.
  body: string
  side?: 'LEFT' | 'RIGHT'   // RIGHT = NEW file (our default)
}

export class GitHubClient {
  private readonly owner: string
  private readonly repo: string

  constructor(
    private readonly cfg: GitHubClientConfig,
    repoFullName: string,
  ) {
    const [owner, repo] = repoFullName.split('/')
    if (!owner || !repo) {
      throw new Error(`Invalid repoFullName: "${repoFullName}". Expected "owner/repo".`)
    }
    this.owner = owner
    this.repo = repo
  }

  private async authHeaders(): Promise<Record<string, string>> {
    const token = await getInstallationToken({
      appId: this.cfg.appId,
      privateKeyPem: this.cfg.privateKeyPem,
      installationId: this.cfg.installationId,
    })
    return {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'villa-pr-reviewer',
    }
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers = await this.authHeaders()
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    const res = await fetch(`https://api.github.com${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '<no body>')
      throw new Error(
        `GitHub ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`,
      )
    }
    // 204 No Content
    if (res.status === 204) return undefined as unknown as T
    return (await res.json()) as T
  }

  async getPullRequest(prNumber: number): Promise<PullRequestInfo> {
    return this.request('GET', `/repos/${this.owner}/${this.repo}/pulls/${prNumber}`)
  }

  /**
   * List all files changed in the PR. GitHub paginates at 30 by default and
   * caps at 100 per page; for huge PRs we iterate. MVP caps at 300 files
   * across 3 pages to bound cost.
   */
  async listChangedFiles(prNumber: number): Promise<ChangedFile[]> {
    const out: ChangedFile[] = []
    for (let page = 1; page <= 3; page++) {
      const batch = await this.request<ChangedFile[]>(
        'GET',
        `/repos/${this.owner}/${this.repo}/pulls/${prNumber}/files?per_page=100&page=${page}`,
      )
      out.push(...batch)
      if (batch.length < 100) break
    }
    return out
  }

  /**
   * Fetch the raw content of a file at a specific commit SHA. Used to get
   * the post-PR file content for the validator.
   */
  async getFileContentAtRef(filePath: string, ref: string): Promise<string | null> {
    try {
      const data = await this.request<{
        content?: string
        encoding?: string
        size?: number
        // For >1MB files GitHub returns a 'submodule'/'symlink'/'binary' type
        type?: string
      }>(
        'GET',
        `/repos/${this.owner}/${this.repo}/contents/${encodeURIComponent(filePath)}?ref=${encodeURIComponent(ref)}`,
      )
      if (!data.content || data.encoding !== 'base64') return null
      return Buffer.from(data.content, 'base64').toString('utf-8')
    } catch {
      return null
    }
  }

  /**
   * Post a single GitHub PR review with N inline comments + an overall body.
   *
   * Important: GitHub will REJECT the whole review if any inline comment
   * references a line that wasn't in the PR diff. The caller must filter
   * comments to lines that GitHub considers "commentable" — see
   * diff-extractor.ts for that filtering.
   */
  async postReview(opts: {
    prNumber: number
    commitId: string
    body: string
    event: 'COMMENT' | 'REQUEST_CHANGES' | 'APPROVE'
    comments: InlineComment[]
  }): Promise<{ id: number }> {
    return this.request('POST', `/repos/${this.owner}/${this.repo}/pulls/${opts.prNumber}/reviews`, {
      commit_id: opts.commitId,
      body: opts.body,
      event: opts.event,
      comments: opts.comments.map((c) => ({
        path: c.path,
        line: c.line,
        side: c.side ?? 'RIGHT',
        body: c.body,
      })),
    })
  }

  /**
   * Create a Check Run on the PR head commit. Shows up in the PR's
   * "Some checks were not successful" section. Returns the check_run id
   * so the caller can update it later if needed.
   */
  async createCheckRun(opts: {
    name: string
    headSha: string
    status: 'queued' | 'in_progress' | 'completed'
    conclusion?: CheckRunConclusion
    summary?: string
    title?: string
    detailsText?: string
  }): Promise<{ id: number }> {
    const payload: Record<string, unknown> = {
      name: opts.name,
      head_sha: opts.headSha,
      status: opts.status,
    }
    if (opts.conclusion) payload.conclusion = opts.conclusion
    if (opts.title || opts.summary || opts.detailsText) {
      payload.output = {
        title: opts.title ?? opts.name,
        summary: opts.summary ?? '',
        text: opts.detailsText,
      }
    }
    return this.request('POST', `/repos/${this.owner}/${this.repo}/check-runs`, payload)
  }

  async updateCheckRun(
    checkRunId: number,
    opts: {
      status?: 'queued' | 'in_progress' | 'completed'
      conclusion?: CheckRunConclusion
      summary?: string
      title?: string
      detailsText?: string
    },
  ): Promise<void> {
    const payload: Record<string, unknown> = {}
    if (opts.status) payload.status = opts.status
    if (opts.conclusion) payload.conclusion = opts.conclusion
    if (opts.title || opts.summary || opts.detailsText) {
      payload.output = {
        title: opts.title ?? 'AI Review',
        summary: opts.summary ?? '',
        text: opts.detailsText,
      }
    }
    await this.request('PATCH', `/repos/${this.owner}/${this.repo}/check-runs/${checkRunId}`, payload)
  }
}
