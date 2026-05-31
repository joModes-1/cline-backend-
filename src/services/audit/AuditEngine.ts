import type { AuditConfig, AuditFinding, AuditReport, ParserResult } from './AuditTypes';
import { detectPlatform } from './MultiPlatformDetector';
// Layer 1 — Static Parsers
import { parseManifest } from './parsers/ManifestParser';
import { parsePlist } from './parsers/PlistParser';
import { parseGradle } from './parsers/GradleParser';
import { parsePubspec } from './parsers/PubspecParser';
import { auditPackageJson } from './parsers/PackageJsonAudit';
import { scanPlaceholders } from './PlaceholderScanner';
import { mapPermissions } from './PermissionMapper';
// Layer 2 — Compliance Rules
import { checkAccountDeletion } from './rules/AccountDeletionChecker';
import { detectApiLevelGaps } from './rules/ApiLevelGapDetector';
import { scanIAPPolicy } from './rules/IAPPolicyScanner';
import { checkPrivacyManifest } from './rules/PrivacyManifestChecker';
import { auditBackgroundPermissions } from './rules/BackgroundPermissionAuditor';
import { checkNetworkSecurity } from './rules/NetworkSecurityChecker';
import { detectDebugFlags } from './rules/DebugFlagDetector';

// ─── Score calculation ────────────────────────────────────────────────────────
// BLOCKER = -15, WARNING = -5, INFO = -1. Floors at 0.
function calculateScore(findings: AuditFinding[], platformFilter?: 'android' | 'ios'): number {
  let score = 100;
  for (const f of findings) {
    if (platformFilter && f.platform !== platformFilter && f.platform !== 'both') continue;
    if (f.severity === 'BLOCKER') score -= 15;
    else if (f.severity === 'WARNING') score -= 5;
    else if (f.severity === 'INFO') score -= 1;
  }
  return Math.max(0, score);
}

// ─── Main Audit Engine ────────────────────────────────────────────────────────
export async function runAudit(config: AuditConfig): Promise<AuditReport> {
  const start = Date.now();
  const { repoId, repoPath, skipParsers = [] } = config;

  const platform = detectPlatform(repoPath);
  const parserResults: ParserResult[] = [];
  const run = (name: string) => !skipParsers.includes(name);

  const hasAndroid = ['android', 'react-native', 'expo', 'flutter'].includes(platform.primary) ||
    platform.targets.includes('android');

  const hasIos = ['ios', 'react-native', 'expo', 'flutter'].includes(platform.primary) ||
    platform.targets.includes('ios');

  const isJs = ['react-native', 'expo'].includes(platform.primary);
  const isFlutter = platform.primary === 'flutter';
  const isUnknown = platform.primary === 'unknown';

  // ── Layer 1: Static Parsers ───────────────────────────────────────────────
  if (run('PlaceholderScanner'))  parserResults.push(scanPlaceholders(repoPath));

  if (hasAndroid || isUnknown) {
    if (run('ManifestParser'))      parserResults.push(parseManifest(repoPath));
    if (run('GradleParser'))        parserResults.push(parseGradle(repoPath));
    if (run('PermissionMapper'))    parserResults.push(mapPermissions(repoPath));
  }

  if (hasIos || isUnknown) {
    if (run('PlistParser'))         parserResults.push(parsePlist(repoPath));
  }

  if (isFlutter || isUnknown) {
    if (run('PubspecParser'))       parserResults.push(await parsePubspec(repoPath));
  }

  if (isJs || isUnknown) {
    if (run('PackageJsonAudit'))    parserResults.push(await auditPackageJson(repoPath));
  }

  // ── Layer 2: Compliance Rules (always run — platform-agnostic where needed) ─
  if (run('AccountDeletionChecker'))    parserResults.push(checkAccountDeletion(repoPath));
  if (run('DebugFlagDetector'))         parserResults.push(detectDebugFlags(repoPath));
  if (run('NetworkSecurityChecker'))    parserResults.push(checkNetworkSecurity(repoPath));

  if (hasAndroid || isUnknown) {
    if (run('ApiLevelGapDetector'))         parserResults.push(detectApiLevelGaps(repoPath));
    if (run('BackgroundPermissionAuditor')) parserResults.push(auditBackgroundPermissions(repoPath));
  }

  if (hasIos || isUnknown) {
    if (run('IAPPolicyScanner'))        parserResults.push(scanIAPPolicy(repoPath));
    if (run('PrivacyManifestChecker'))  parserResults.push(checkPrivacyManifest(repoPath));
  }

  // ── Aggregate + deduplicate findings ─────────────────────────────────────
  const seen = new Set<string>();
  const dedupedFindings = parserResults
    .flatMap(r => r.findings)
    .filter(f => { if (seen.has(f.id)) return false; seen.add(f.id); return true; });

  const sortOrder = { BLOCKER: 0, WARNING: 1, INFO: 2 };
  dedupedFindings.sort((a, b) => sortOrder[a.severity] - sortOrder[b.severity]);

  // ── Scores ────────────────────────────────────────────────────────────────
  const scores: AuditReport['scores'] = { overall: calculateScore(dedupedFindings) };
  if (hasAndroid) scores.android = calculateScore(dedupedFindings, 'android');
  if (hasIos)     scores.ios     = calculateScore(dedupedFindings, 'ios');

  const blockers = dedupedFindings.filter(f => f.severity === 'BLOCKER').length;
  const warnings = dedupedFindings.filter(f => f.severity === 'WARNING').length;
  const info     = dedupedFindings.filter(f => f.severity === 'INFO').length;

  return {
    repoId,
    repoPath,
    scannedAt: new Date().toISOString(),
    durationMs: Date.now() - start,
    platform,
    scores,
    findings: dedupedFindings,
    summary: { blockers, warnings, info, storeReady: blockers === 0 },
    parsersRun: parserResults.map(r => r.parserName),
  };
}
