/**
 * test-real-autofix.ts
 *
 * Exercises the EXACT same path as the UI "Apply Fix" button:
 *   POST /repos/:repoId/autofix  → Cline agent task
 *   GET  /repos/:repoId/autofix/:taskId/diff  (polls every 2s)
 *   GET  /repos/:repoId/autofix/:taskId/status
 *
 * Picks a real, non-trivial issue (hardcoded JWT secret → env var),
 * runs the full AI fix, then reads the file to confirm the edit.
 *
 * Usage:
 *   npx tsx scripts/test-real-autofix.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── Config ───────────────────────────────────────────────────────────────────
const BASE_URL  = 'http://localhost:3004/api';
const EMAIL     = 'jomodes11@gmail.com';
const PASSWORD  = 'password';
const REPO_ID   = 'joModes-1_chatapp-backend_1775722589874';
const REPO_PATH = path.join(
  'C:/Users/USER/Downloads/ClineMainCopyV2/cline-main/.villa-repos',
  REPO_ID,
);
const POLL_INTERVAL_MS = 2000;
const MAX_POLL_TICKS   = 60; // 120s max wait

// ─── Helpers ─────────────────────────────────────────────────────────────────
function section(t: string) {
  console.log(`\n${'─'.repeat(65)}\n  ${t}\n${'─'.repeat(65)}`);
}
function ok(m: string)   { console.log(`  ✅ ${m}`); }
function fail(m: string) { console.error(`  ❌ ${m}`); }
function info(m: string) { console.log(`     ${m}`); }

async function api(method: string, endpoint: string, body?: unknown, token?: string) {
  // Disable HTTP keep-alive: the scan step takes ~3 minutes, which leaves
  // pooled sockets idle long enough that the server's default 5s keep-alive
  // timeout closes them. The next pooled-reuse then ECONNRESETs. Closing per
  // request avoids the stale-socket race entirely.
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Connection': 'close' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${BASE_URL}${endpoint}`, {
        method,
        headers,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const text = await res.text();
      try { return { status: res.status, data: JSON.parse(text), raw: text }; }
      catch { return { status: res.status, data: null, raw: text }; }
    } catch (err) {
      lastErr = err;
      const code = (err as any)?.cause?.code;
      if (code !== 'ECONNRESET' && code !== 'UND_ERR_SOCKET') throw err;
      await sleep(300);
    }
  }
  throw lastErr;
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ─── Main ─────────────────────────────────────────────────────────────────────
async function run() {
  console.log('\n' + '═'.repeat(65));
  console.log('  Villa Real Autofix — End-to-End Backend Test');
  console.log('  (Same path as UI "Apply Fix" button)');
  console.log('═'.repeat(65));

  // ── Step 1: Auth ──────────────────────────────────────────────────────────
  section('Step 1: Authenticate');
  const auth = await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
  const token = auth.data?.token ?? auth.data?.data?.token;
  if (!token) { fail('Login failed: ' + auth.raw.slice(0, 200)); process.exit(1); }
  ok(`Logged in as ${EMAIL}`);

  // ── Step 2: Scan (uses cache) ─────────────────────────────────────────────
  section('Step 2: Scan repository (cached)');
  const scan = await api('POST', `/repos/${REPO_ID}/scan`, { maxFiles: 50 }, token);
  if (!scan.data?.success) { fail('Scan failed: ' + scan.raw.slice(0, 200)); process.exit(1); }
  const issues: any[] = scan.data.data?.issues ?? [];
  ok(`Got ${issues.length} issues from scan`);

  // ── Step 3: Pick a genuinely fixable issue ────────────────────────────────
  section('Step 3: Select a real fixable issue');

  // Find an issue whose replacement is NOT already in the file → real edit needed
  let chosenIssue: any = null;
  for (const issue of issues) {
    if (!issue.file || !issue.suggestedFix?.replacement) continue;
    const absPath = path.join(REPO_PATH, String(issue.file).replace(/\\/g, '/'));
    if (!fs.existsSync(absPath)) continue;
    const content = fs.readFileSync(absPath, 'utf-8');
    if (!content.includes(issue.suggestedFix.replacement)) {
      chosenIssue = issue;
      break;
    }
  }

  if (!chosenIssue) {
    fail('No genuinely fixable issue found — all suggestions already present in files.');
    process.exit(1);
  }

  ok(`Chosen issue:`);
  info(`  File    : ${chosenIssue.file}`);
  info(`  Line    : ${chosenIssue.line}`);
  info(`  Rule    : ${chosenIssue.ruleId}`);
  info(`  Message : ${chosenIssue.message}`);
  info(`  Fix     : ${chosenIssue.suggestedFix.replacement.slice(0, 80)}`);

  const filePath = path.join(REPO_PATH, String(chosenIssue.file).replace(/\\/g, '/'));
  const contentBefore = fs.readFileSync(filePath, 'utf-8');
  info(`  File size: ${contentBefore.length} chars`);

  // ── Step 4: Call POST /autofix (the exact UI button path) ─────────────────
  section('Step 4: POST /autofix — start Cline agent task');
  const autofixRes = await api('POST', `/repos/${REPO_ID}/autofix`, { issue: chosenIssue }, token);
  info(`  Response status: ${autofixRes.status}`);
  info(`  Response: ${JSON.stringify(autofixRes.data).slice(0, 200)}`);

  if (!autofixRes.data?.success) {
    fail('Autofix POST failed: ' + autofixRes.raw.slice(0, 300));
    process.exit(1);
  }

  if (autofixRes.data.data?.alreadyResolved) {
    ok('Server short-circuited: ' + autofixRes.data.data.message);
    info('(No LLM needed — fix already present)');
    process.exit(0);
  }

  const taskId = autofixRes.data.data?.taskId;
  if (!taskId) { fail('No taskId returned'); process.exit(1); }
  ok(`Task started: ${taskId}`);

  // ── Step 5: Poll diff + status (same as UI polling) ───────────────────────
  section('Step 5: Poll diff endpoint (same as UI Changes tab)');
  let diffLanded = false;
  let finalDiff  = '';

  for (let tick = 1; tick <= MAX_POLL_TICKS; tick++) {
    await sleep(POLL_INTERVAL_MS);

    // Status
    const statusRes = await api('GET', `/repos/${REPO_ID}/autofix/${taskId}/status`, undefined, token);
    const status = statusRes.data?.data ?? {};

    // Diff (plain-text endpoint, same as frontend)
    const diffRes = await api('GET', `/repos/${REPO_ID}/autofix/${taskId}/diff?file=${encodeURIComponent(chosenIssue.file)}`, undefined, token);
    const diffText = typeof diffRes.raw === 'string' ? diffRes.raw : '';

    info(`  [tick ${String(tick).padStart(2)}/${MAX_POLL_TICKS}] ` +
         `running=${status.isStreaming} didEdit=${status.didEditFile} ` +
         `mistakes=${status.consecutiveMistakeCount ?? 0} ` +
         `diffLen=${diffText.trim().length}`);

    if (diffText.trim().length > 0) {
      ok(`Diff arrived at tick ${tick}!`);
      finalDiff = diffText;
      diffLanded = true;
      break;
    }

    // Stop early if task is done and print last AI messages for diagnosis
    if (!status.isStreaming && !status.isActive && tick > 3) {
      info(`  Task done (isActive=${status.isActive})`);
      const msgs: any[] = status.lastMessages ?? [];
      if (msgs.length > 0) {
        info('  ── Last AI messages ──');
        msgs.forEach((m: any) => info(`  [${m.role}] ${String(m.text).slice(0, 200)}`));
      }
      break;
    }
  }

  // ── Step 6: Verify file on disk ───────────────────────────────────────────
  section('Step 6: Verify real file edit on disk');
  const contentAfter = fs.readFileSync(filePath, 'utf-8');
  const fileChanged  = contentAfter !== contentBefore;

  if (fileChanged) {
    ok(`FILE WAS ACTUALLY MODIFIED on disk ✅`);
    info(`  Before length: ${contentBefore.length} chars`);
    info(`  After  length: ${contentAfter.length} chars`);

    if (finalDiff) {
      info('\n  Unified diff:');
      finalDiff.split('\n').slice(0, 30).forEach(l => info('  ' + l));
    } else {
      info('  (diff polling timed out but file did change — content diff below)');
      // Show first changed line
      const beforeLines = contentBefore.split('\n');
      const afterLines  = contentAfter.split('\n');
      for (let i = 0; i < Math.max(beforeLines.length, afterLines.length); i++) {
        if (beforeLines[i] !== afterLines[i]) {
          info(`  Line ${i+1} before: ${(beforeLines[i] ?? '').slice(0, 80)}`);
          info(`  Line ${i+1} after : ${(afterLines[i] ?? '').slice(0, 80)}`);
        }
      }
    }
  } else {
    fail(`FILE WAS NOT MODIFIED — Cline agent ran but made no disk change`);
    info('');
    info('  Possible reasons:');
    info('  1. Model called attempt_completion without using write_to_file');
    info('  2. replace_in_file SEARCH block did not match → silently reverted');
    info('  3. autoApprovalSettings.editFiles was false → edit blocked at approval step');
    info('  4. Workspace root override did not resolve correctly');
    info('  5. Issue was a false positive — model decided nothing needed changing');
    info('');
    if (diffLanded) {
      info('  Diff endpoint DID return content, but file matches original:');
      info('  → This means diff compares against empty snapshot (before="")');
      info('  → Snapshot was not saved before the edit happened (race condition)');
    }
  }

  // ── Final summary ─────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(65));
  console.log(`  Result: File ${fileChanged ? 'CHANGED ✅' : 'UNCHANGED ❌'} | Diff ${diffLanded ? 'RECEIVED ✅' : 'NOT RECEIVED ❌'}`);
  console.log('═'.repeat(65));

  process.exit(fileChanged ? 0 : 1);
}

run().catch(err => { console.error(err); process.exit(1); });
