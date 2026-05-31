import * as fs from 'fs';
import * as path from 'path';
import type { AuditFinding, ParserResult } from '../AuditTypes';

// ─── Apple mandate: Jun 2022 ──────────────────────────────────────────────────
// Every iOS/Android app that supports account creation MUST provide in-app
// account deletion. Apps missing this are rejected by both stores.
// https://developer.apple.com/news/releases/2022-01-31-account-deletion.html

// ─── Signals that the app supports account creation ──────────────────────────
// If any of these exist, an account deletion flow is REQUIRED
const ACCOUNT_CREATION_SIGNALS: RegExp[] = [
  /signUp|sign_up|createAccount|create_account|register\b/i,
  /SignUpScreen|RegisterScreen|CreateAccountScreen/i,
  /auth\/register|auth\/signup|user\/create/i,
  /createUserWithEmailAndPassword|signUp\s*\(/i,  // Firebase
  /supabase.*signUp|\.signUp\(/i,
  /Auth\.createUser|amplify.*signUp/i,
];

// ─── Signals that deletion exists ────────────────────────────────────────────
const DELETION_SIGNALS: RegExp[] = [
  /deleteAccount|delete_account|removeAccount|remove_account/i,
  /DeleteAccountScreen|RemoveAccountScreen|AccountDeletionScreen/i,
  /auth\/delete|user\/delete|account\/delete|account\/remove/i,
  /\.delete\s*\(\s*\)|deleteUser\s*\(/i,           // Firebase deleteUser
  /supabase.*delete.*user|rpc.*delete.*account/i,
  /deactivateAccount|terminateAccount|closeAccount/i,
  /GDPR.*delete|right.*erasure|data.*deletion/i,
];

// ─── File extensions to scan ─────────────────────────────────────────────────
const SCAN_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.dart', '.kt', '.java', '.swift', '.vue', '.py']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'build', 'dist', '.gradle', 'Pods', '.dart_tool']);

function* walkFiles(dir: string, depth = 0): Generator<string> {
  if (depth > 8) return;
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walkFiles(full, depth + 1);
    else if (SCAN_EXTENSIONS.has(path.extname(e.name).toLowerCase())) yield full;
  }
}

function buildCorpus(repoPath: string): { corpus: string; filesScanned: number } {
  let corpus = '';
  let filesScanned = 0;
  for (const f of walkFiles(repoPath)) {
    if (filesScanned > 400) break;
    try { corpus += fs.readFileSync(f, 'utf-8') + '\n'; filesScanned++; } catch { /* skip */ }
  }
  return { corpus, filesScanned };
}

// ─── Main checker ─────────────────────────────────────────────────────────────
export function checkAccountDeletion(repoPath: string): ParserResult {
  const findings: AuditFinding[] = [];
  const { corpus, filesScanned } = buildCorpus(repoPath);

  if (!corpus.trim()) {
    return { parserName: 'AccountDeletionChecker', findings, metadata: { filesScanned, skipped: true } };
  }

  const hasCreation = ACCOUNT_CREATION_SIGNALS.some(re => re.test(corpus));
  const hasDeletion = DELETION_SIGNALS.some(re => re.test(corpus));

  if (hasCreation && !hasDeletion) {
    findings.push({
      id: 'COMPLIANCE_NO_ACCOUNT_DELETION',
      severity: 'BLOCKER',
      category: 'COMPLIANCE',
      platform: 'both',
      title: 'No account deletion flow detected',
      description:
        'This app appears to support account creation but no account deletion mechanism was found. ' +
        'Apple has required in-app account deletion since June 2022 (App Store Guideline 5.1.1). ' +
        'Google Play enforced the same requirement from December 2023. Apps missing this are rejected.',
      fixSuggestion:
        'Add a "Delete Account" option in your app settings or account profile screen. ' +
        'It must permanently delete all user data server-side. ' +
        'See: https://developer.apple.com/support/offering-account-deletion-in-your-app/',
      storeRule: 'App Store Guideline 5.1.1 / Google Play Account Deletion Policy (Dec 2023)',
    });
  }

  if (!hasCreation && !hasDeletion) {
    findings.push({
      id: 'COMPLIANCE_ACCOUNT_DELETION_UNVERIFIED',
      severity: 'INFO',
      category: 'COMPLIANCE',
      platform: 'both',
      title: 'Could not verify account deletion flow',
      description:
        'No account creation or deletion signals were detected in the scanned source files. ' +
        'If your app supports user accounts, manually verify that account deletion is implemented.',
      fixSuggestion:
        'If your app has user accounts, add a visible "Delete Account" option that removes all user data. Required by Apple and Google.',
    });
  }

  return {
    parserName: 'AccountDeletionChecker',
    findings,
    metadata: {
      filesScanned,
      hasAccountCreation: hasCreation,
      hasAccountDeletion: hasDeletion,
    },
  };
}
