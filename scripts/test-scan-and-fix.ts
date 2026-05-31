/**
 * test-scan-and-fix.ts
 *
 * End-to-end backend test for Villa Code Reviewer:
 *   1. Authenticate with the running server
 *   2. Scan the target repo (uses 1-hour cache if already scanned)
 *   3. Apply fixes for every fixable issue directly to the files on disk
 *   4. Show git diff to prove real edits were made
 *
 * Usage:
 *   npx tsx scripts/test-scan-and-fix.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// ─── Config ───────────────────────────────────────────────────────────────────
const BASE_URL  = 'http://localhost:3004/api';
const EMAIL     = 'jomodes11@gmail.com';
const PASSWORD  = 'password';
const REPO_ID   = 'joModes-1_chatapp-backend_1775722589874';
const REPO_PATH = path.join(
  'C:/Users/USER/Downloads/ClineMainCopyV2/cline-main/.villa-repos',
  REPO_ID,
);

// ─── Helpers ─────────────────────────────────────────────────────────────────
let passed = 0, failed = 0, fixed = 0, skipped = 0;
function ok(label: string)    { console.log(`  ✅ ${label}`); passed++; }
function fail(label: string)  { console.error(`  ❌ ${label}`); failed++; }
function info(label: string)  { console.log(`     ${label}`); }
function section(t: string)   { console.log(`\n${'─'.repeat(60)}\n  ${t}\n${'─'.repeat(60)}`); }

async function apiPost(endpoint: string, body: unknown, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  return res.json() as Promise<any>;
}

// Apply a line-based fix: find the matching line, replace, write back.
// Returns true if the file was actually changed.
function applyLineFix(
  filePath: string,
  lineNumber: number,
  existingCode: string | undefined,
  replacement: string,
): boolean {
  let content: string;
  try { content = fs.readFileSync(filePath, 'utf-8'); }
  catch { return false; }

  // Guard: replacement already present → no-op
  if (content.includes(replacement)) return false;

  const lines = content.split(/\r?\n/);
  const idx   = lineNumber - 1; // 1-based → 0-based

  // Find the target line — prefer matching by code snippet, fall back to line number
  let targetIdx = -1;
  if (existingCode && existingCode.trim().length > 0) {
    // Search from reported line outward (AI line numbers are sometimes off by ±2)
    for (let delta = 0; delta <= 5; delta++) {
      for (const i of [idx + delta, idx - delta]) {
        if (i >= 0 && i < lines.length && lines[i].trim() === existingCode.trim()) {
          targetIdx = i;
          break;
        }
      }
      if (targetIdx !== -1) break;
    }
  }
  if (targetIdx === -1 && idx >= 0 && idx < lines.length) {
    targetIdx = idx; // fall back to reported line number
  }
  if (targetIdx === -1) return false;

  // Preserve indentation of original line
  const indent = lines[targetIdx].match(/^(\s*)/)?.[1] ?? '';
  lines[targetIdx] = indent + replacement.trimStart();

  const newContent = lines.join('\n');
  if (newContent === content) return false;

  fs.writeFileSync(filePath, newContent, 'utf-8');
  return true;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function run() {
  console.log('\n' + '═'.repeat(60));
  console.log('  Villa Scan + Fix — End-to-End Backend Test');
  console.log('═'.repeat(60));

  // ── Step 1: Authenticate ──────────────────────────────────────────────────
  section('Step 1: Authenticate');
  const authResp = await apiPost('/auth/login', { email: EMAIL, password: PASSWORD });
  // Auth response puts token at root level (not under .data)
  const token = authResp.token ?? authResp.data?.token;
  if (!authResp.success || !token) {
    fail(`Login failed: ${authResp.error ?? JSON.stringify(authResp)}`);
    process.exit(1);
  }
  ok(`Logged in as ${EMAIL}`);

  // ── Step 2: Scan ──────────────────────────────────────────────────────────
  section('Step 2: Scan repository (uses 1-hour cache if available)');
  const scanResp = await apiPost(`/repos/${REPO_ID}/scan`, { maxFiles: 50 }, token);
  if (!scanResp.success || !scanResp.data) {
    fail(`Scan failed: ${scanResp.error ?? JSON.stringify(scanResp)}`);
    process.exit(1);
  }

  // Response shape: { data: { repoId, issues: [...], summary: { totalFiles, criticalCount, warningCount, infoCount } } }
  // The route flattens all per-file issues and attaches `file` to each one.
  // NOTE: in the flat format, `issue.code` is set to `suggestedFix.replacement` (the suggestion),
  // NOT the original line — so we must use line-number matching, not code-content matching.
  const { issues: allIssues, summary } = scanResp.data as {
    issues: any[];
    summary: { totalFiles: number; filesWithIssues: number; criticalCount: number; warningCount: number };
  };
  ok(`Scan complete — ${summary.totalFiles} files, ${allIssues.length} issues`);
  info(`  ${summary.criticalCount} critical  ${summary.warningCount} warnings`);

  // ── Step 3: Apply fixes ───────────────────────────────────────────────────
  section('Step 3: Apply fixes to files on disk');
  const fixableIssues = allIssues.filter(
    i => i.suggestedFix?.replacement && i.suggestedFix.replacement.trim().length > 0 && i.file
  );
  info(`Issues with a suggestedFix: ${fixableIssues.length}`);

  for (const issue of fixableIssues) {
    const relFile  = String(issue.file).replace(/\\/g, '/');
    const absFile  = path.join(REPO_PATH, relFile);
    const lineNum  = Number(issue.line) || 1;
    const replacement = issue.suggestedFix.replacement;
    // NOTE: in the flat scan format `issue.code` is the replacement (not the original line),
    // so we pass undefined here to force line-number-based matching in applyLineFix.
    const existingCode = undefined;

    if (!fs.existsSync(absFile)) {
      info(`  SKIP (file not found): ${relFile}`);
      skipped++;
      continue;
    }

    // Read current content to run no-op guard
    const currentContent = fs.readFileSync(absFile, 'utf-8');
    if (currentContent.includes(replacement)) {
      info(`  SKIP (already resolved): ${relFile}:${lineNum} — ${issue.ruleId}`);
      skipped++;
      continue;
    }

    const wasFixed = applyLineFix(absFile, lineNum, existingCode, replacement);
    if (wasFixed) {
      ok(`  FIXED: ${relFile}:${lineNum} — ${issue.ruleId}`);
      info(`    now: ${replacement.trim().slice(0, 80)}`);
      fixed++;
    } else {
      info(`  SKIP (line not matched or no change): ${relFile}:${lineNum} — ${issue.ruleId}`);
      skipped++;
    }
  }

  // ── Step 4: Git diff to prove real edits ──────────────────────────────────
  section('Step 4: Git diff — real edits on disk');
  try {
    const diff = execSync('git diff --stat', { cwd: REPO_PATH, encoding: 'utf-8' });
    if (diff.trim().length > 0) {
      ok('git diff confirms real file changes:');
      console.log(diff);

      // Show actual line-level diff for changed files
      const fullDiff = execSync('git diff', { cwd: REPO_PATH, encoding: 'utf-8' });
      const lines = fullDiff.split('\n');
      // Print first 120 lines of diff to keep output readable
      console.log(lines.slice(0, 120).join('\n'));
      if (lines.length > 120) info(`  ... (${lines.length - 120} more diff lines)`);
    } else {
      info('git diff is empty — no files were modified');
    }
  } catch (e) {
    info(`git diff failed (not a git repo or git not found): ${e}`);
  }

  // ── Final result ──────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log(`  Scan + Fix results:`);
  console.log(`    Issues found : ${allIssues?.length ?? 0}`);
  console.log(`    Fixable      : ${fixableIssues.length}`);
  console.log(`    Fixed        : ${fixed}`);
  console.log(`    Skipped      : ${skipped}`);
  console.log(`    Test: ${passed} passed, ${failed} failed`);
  console.log('═'.repeat(60));
  if (failed > 0) process.exit(1);
}

run().catch(err => { console.error(err); process.exit(1); });
