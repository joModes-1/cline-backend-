# `@villa/github-pr-review` — Portable GitHub PR Review Pipeline

A self-contained module that reviews GitHub Pull Requests using **your validator**.
Drop the directory into any Node + Express project. **Zero external runtime
dependencies** — uses only `express` (which your project already has) and
Node's built-in `crypto` + `fetch`.

CodeRabbit-style flow: install the GitHub App on a repo → it reviews every
PR → posts inline comments + a check run. The validator is **injected**, so
the same module can carry a security validator, a style validator, a
compliance validator — anything you can express as
`(file, content, changedLines) → findings[]`.

---

## How to lift this module into another project

1. Copy the entire directory:
   ```bash
   cp -r ./integrations/github-pr-review /path/to/other/project/src/integrations/
   ```
2. Make sure the host project has `express` installed (≥ 4.17). Nothing else.
3. Import + wire:
   ```ts
   import { createGitHubPRReviewer } from './integrations/github-pr-review'
   const reviewer = createGitHubPRReviewer({ ...config })
   app.use('/api/github-pr', reviewer.router)
   ```
4. Done. The module is fully decoupled from the host — it imports nothing
   project-specific. The host injects its `validate` function.

---

## One-time GitHub App setup

The pipeline needs a GitHub App (NOT an OAuth App and NOT a personal token).

1. Go to **https://github.com/settings/apps/new**.
2. Fill in:
   - **GitHub App name** — your product name.
   - **Homepage URL** — anything (your landing page).
   - **Webhook URL** — `https://<your-host>/api/github-pr/webhook` (use ngrok during dev).
   - **Webhook secret** — generate a random string, save it.
   - **Permissions**:
     | Permission | Access |
     |---|---|
     | Pull requests | Read & write |
     | Contents | Read |
     | Metadata | Read |
     | Checks | Read & write |
   - **Subscribe to events**: `Pull request`.
   - **Where can this GitHub App be installed?** — Only on this account
     (for testing). Switch to "Any account" later.
3. **Create**. You'll be taken to the App settings page.
4. Note the **App ID** (top of the page, ~6 digits).
5. Scroll to **Private keys** → **Generate a private key**. A `.pem`
   downloads — keep it safe.
6. **Install App** (left sidebar) → install on the repo you'll be testing
   against. Note the **Installation ID** in the URL of the install page
   (e.g. `https://github.com/settings/installations/12345678` → `12345678`).

---

## Configuration

Environment variables the host should expose:

```bash
GITHUB_APP_ID=123456
# Keep the PEM as a single env var. Newlines must be REAL newlines.
# When pasting in a shell or .env, use $'...' or quote with literal \n then
# load it with a small wrapper:
#   const key = process.env.GITHUB_APP_PRIVATE_KEY!.replace(/\\n/g, '\n')
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
...
-----END RSA PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET=<the random string from step 2 above>
```

---

## Minimum wire-up example

```ts
import express from 'express'
import { createGitHubPRReviewer, type PRReviewFinding } from './integrations/github-pr-review'

const app = express()

const reviewer = createGitHubPRReviewer({
  appId: process.env.GITHUB_APP_ID!,
  privateKey: process.env.GITHUB_APP_PRIVATE_KEY!.replace(/\\n/g, '\n'),
  webhookSecret: process.env.GITHUB_WEBHOOK_SECRET!,
  checkName: 'Villa AI',

  // YOUR validator. Called once per changed file in the PR.
  // Return an empty array if you have nothing to say.
  validate: async ({ path, content, changedLines, prNumber, repo }) => {
    const findings: PRReviewFinding[] = []
    // ... your logic here. Example:
    if (path.endsWith('.js') && content.includes('eval(')) {
      // Find the line `eval(` is on, but only flag if it's a changed line.
      const lines = content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('eval(') && changedLines.includes(i + 1)) {
          findings.push({
            severity: 'error',
            line: i + 1,
            ruleId: 'security/no-eval',
            message: 'Avoid `eval` — it executes arbitrary code.',
            suggestion: lines[i].replace('eval(', 'JSON.parse('),
          })
        }
      }
    }
    return findings
  },
})

app.use('/api/github-pr', reviewer.router)
app.listen(3004)
```

---

## Local development with ngrok

GitHub needs a public URL for the webhook. During dev:

```bash
ngrok http 3004
# → https://abcd-12-34-56-78.ngrok-free.app
```

Set the GitHub App webhook URL to `https://abcd-…ngrok-free.app/api/github-pr/webhook`.
Click **Redeliver** in the App's "Advanced → Recent Deliveries" tab to retest
without making real PRs.

---

## What runs when a PR is opened

```
PR opened on installed repo
   │
   ▼
POST /api/github-pr/webhook                 (HMAC verified, returns 200 fast)
   │
   ▼
Queue                                       (in-process, coalesces by repo+PR)
   │
   ▼
runPRReview()
   ├─ Mint installation token (cached 1h)
   ├─ Create check run "in_progress"        ← visible in PR within ~1s
   ├─ GET /pulls/:n/files                   (changed files + patches)
   ├─ For each file (skipping locks/binaries/oversized):
   │    ├─ GET /contents/:path?ref=<head>
   │    ├─ parse patch → set of commentable lines
   │    ├─ validate({ path, content, changedLines })
   │    └─ drop findings outside the diff
   ├─ POST /pulls/:n/reviews                (inline comments + summary)
   └─ PATCH check-runs/:id                  (success / failure / neutral)
```

---

## What the module does NOT do (yet)

- **Persistence.** No DB. Every webhook is processed in-memory. If the
  server restarts mid-job, that PR review is lost (GitHub will retry after
  a delay, but only a few times).
- **Multi-tenant scoping.** No "which user installed this app" tracking.
  Add a DB lookup before `validate` if you need per-installation config.
- **Auto-fix PRs.** No bot that opens a fix PR. Today the module only
  posts review comments + suggestion blocks (which the user can click
  "Apply suggestion" on inside GitHub).
- **Distributed queue.** Single-instance only. For multi-worker:
  replace `webhook-router.ts`'s `InProcessQueue` with BullMQ — the
  contract is just `enqueue(job) → drain(handler)`.
- **Rate-limit awareness.** GitHub gives ~5,000 req/hr per installation;
  most reviews use 5–20 requests. We don't paginate beyond 300 files.

---

## File index

```
github-pr-review/
├── index.ts                ← public factory: createGitHubPRReviewer()
├── types.ts                ← all type definitions, zero imports
├── webhook-router.ts       ← Express router + in-process queue
├── webhook-verify.ts       ← HMAC signature verification
├── github-app-auth.ts      ← App JWT + installation token + cache
├── github-client.ts        ← REST wrapper (no octokit, just fetch)
├── diff-extractor.ts       ← unified diff → commentable line set
├── pr-review-pipeline.ts   ← orchestrator (the actual review loop)
├── review-formatter.ts     ← findings → GitHub review payload
└── README.md               ← this file
```

---

## License

Whatever your host project uses. The module has no third-party code to relicense.
