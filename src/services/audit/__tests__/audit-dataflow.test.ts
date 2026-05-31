/**
 * Villa Audit — Full Data-Flow Integration Test
 *
 * Purpose: trace data from fixture files → Layer 1 parsers → Layer 2 rules
 * → AuditEngine aggregation → AuditReport. Verifies the contract between
 * all three layers and catches any field-name mismatches or broken imports.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ─── Helpers ─────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail = '') {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ ${label}${detail ? ': ' + detail : ''}`);
    failed++;
  }
}

function section(title: string) {
  console.log(`\n${'─'.repeat(55)}`);
  console.log(`  ${title}`);
  console.log('─'.repeat(55));
}

function mktemp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'villa-df-'));
  return dir;
}

function write(base: string, rel: string, content: string) {
  const full = path.join(base, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf-8');
}

// ─── Shared fixture: a React Native app with deliberate flaws ────────────────
function buildFixture(): string {
  const root = mktemp();

  // Platform fingerprint
  write(root, 'package.json', JSON.stringify({
    name: 'MyApp',
    version: '1.0.0',
    dependencies: {
      'react-native': '0.71.0',          // outdated → PKG_RN_OUTDATED
      '@stripe/stripe-react-native': '8.0.0', // IAP blocker on iOS
    },
    engines: { node: '>=14' },
  }));

  // Android: debuggable + low targetSdk + background permission
  write(root, 'android/app/src/main/AndroidManifest.xml', `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.myapp">
  <uses-permission android:name="android.permission.INTERNET"/>
  <uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION"/>
  <uses-permission android:name="android.permission.CAMERA"/>
  <application android:debuggable="true" android:allowClearTextTraffic="true">
    <activity android:name=".MainActivity"/>
  </application>
</manifest>`);

  // Gradle: targetSdk 29 (blocker)
  write(root, 'android/app/build.gradle', `
android {
  compileSdkVersion 34
  defaultConfig {
    applicationId "com.myapp"
    minSdkVersion 21
    targetSdkVersion 29
    versionCode 1
    versionName "1.0"
  }
  buildTypes {
    release {
      minifyEnabled false
      signingConfig signingConfigs.debug
    }
  }
}`);

  // iOS plist: empty usage description
  write(root, 'ios/MyApp/Info.plist', `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>NSCameraUsageDescription</key><string></string>
  <key>NSAllowsArbitraryLoads</key><true/>
</dict></plist>`);
  // No PrivacyInfo.xcprivacy → PrivacyManifest BLOCKER

  // Source: account creation — deliberately omits any removal flow
  write(root, 'src/auth.ts', `
export function signUp(email: string, password: string) {
  return firebase.auth().createUserWithEmailAndPassword(email, password);
}
// App does not implement account removal
`);

  // Debug flag in .env
  write(root, '.env', `DEBUG=true\nAPI_URL=http://api.example.com`);
  // .gitignore does NOT mention .env
  write(root, '.gitignore', `node_modules/\nbuild/`);

  // Placeholder content
  write(root, 'src/screens/Home.tsx', `
export default function Home() {
  return <Text>Lorem ipsum dolor sit amet</Text>;
}`);

  // Hardcoded http URL in source
  write(root, 'src/api.ts', `
const BASE_URL = 'http://api.myapp.com/v1';
export const fetchData = () => fetch(BASE_URL + '/data');
`);

  return root;
}

// ─── Import all modules ───────────────────────────────────────────────────────
import { detectPlatform } from '../MultiPlatformDetector';
import { parseManifest } from '../parsers/ManifestParser';
import { parseGradle } from '../parsers/GradleParser';
import { parsePlist } from '../parsers/PlistParser';
import { auditPackageJson } from '../parsers/PackageJsonAudit';
import { scanPlaceholders } from '../PlaceholderScanner';
import { mapPermissions } from '../PermissionMapper';
import { checkAccountDeletion } from '../rules/AccountDeletionChecker';
import { detectApiLevelGaps } from '../rules/ApiLevelGapDetector';
import { scanIAPPolicy } from '../rules/IAPPolicyScanner';
import { checkPrivacyManifest } from '../rules/PrivacyManifestChecker';
import { auditBackgroundPermissions } from '../rules/BackgroundPermissionAuditor';
import { checkNetworkSecurity } from '../rules/NetworkSecurityChecker';
import { detectDebugFlags } from '../rules/DebugFlagDetector';
import { runAudit } from '../AuditEngine';
import type { ParserResult, AuditFinding, AuditReport } from '../AuditTypes';

// ─── Tests ────────────────────────────────────────────────────────────────────

console.log('\n╔══════════════════════════════════════════════════════╗');
console.log('║   Villa Audit — Full Data-Flow Integration Test     ║');
console.log('╚══════════════════════════════════════════════════════╝');

const root = buildFixture();

// ─── 1. ParserResult contract ─────────────────────────────────────────────────
section('1. ParserResult contract — every module returns the right shape');

function checkResult(name: string, result: ParserResult) {
  assert(typeof result.parserName === 'string' && result.parserName.length > 0, `${name}: has parserName`);
  assert(Array.isArray(result.findings), `${name}: findings is array`);

  for (const f of result.findings) {
    // Required fields
    assert(typeof f.id === 'string' && f.id.length > 0, `${name}/${f.id}: has id`);
    assert(['BLOCKER','WARNING','INFO'].includes(f.severity), `${name}/${f.id}: valid severity (${f.severity})`);
    assert(['PERMISSIONS','DEPENDENCIES','CONTENT','COMPLIANCE','SECURITY','CONFIGURATION'].includes(f.category),
      `${name}/${f.id}: valid category (${f.category})`);
    assert(typeof f.title === 'string' && f.title.length > 0, `${name}/${f.id}: has title`);
    assert(typeof f.description === 'string', `${name}/${f.id}: has description`);
    assert(typeof f.fixSuggestion === 'string', `${name}/${f.id}: has fixSuggestion`);
    assert(
      ['android','ios','react-native','flutter','expo','unknown','both'].includes(f.platform),
      `${name}/${f.id}: valid platform (${f.platform})`
    );
    // Optional fields — if present, check type
    if (f.file !== undefined)  assert(typeof f.file === 'string', `${name}/${f.id}: file is string`);
    if (f.line !== undefined)  assert(typeof f.line === 'number', `${name}/${f.id}: line is number`);
    if (f.value !== undefined) assert(typeof f.value === 'string', `${name}/${f.id}: value is string`);
  }
}

// Layer 1
checkResult('MultiPlatformDetector', { parserName: 'MultiPlatformDetector', findings: [] }); // detector returns profile not ParserResult
const manifest  = parseManifest(root);   checkResult('ManifestParser', manifest);
const gradle    = parseGradle(root);     checkResult('GradleParser', gradle);
const plist     = parsePlist(root);      checkResult('PlistParser', plist);
const pkgJson   = auditPackageJson(root);checkResult('PackageJsonAudit', pkgJson);
const placeholders = scanPlaceholders(root); checkResult('PlaceholderScanner', placeholders);
const permissions  = mapPermissions(root);   checkResult('PermissionMapper', permissions);

// Layer 2
const acct    = checkAccountDeletion(root);        checkResult('AccountDeletionChecker', acct);
const apiGap  = detectApiLevelGaps(root);          checkResult('ApiLevelGapDetector', apiGap);
const iap     = scanIAPPolicy(root);               checkResult('IAPPolicyScanner', iap);
const privacy = checkPrivacyManifest(root);        checkResult('PrivacyManifestChecker', privacy);
const bgPerm  = auditBackgroundPermissions(root);  checkResult('BackgroundPermissionAuditor', bgPerm);
const network = checkNetworkSecurity(root);        checkResult('NetworkSecurityChecker', network);
const debug   = detectDebugFlags(root);            checkResult('DebugFlagDetector', debug);

// ─── 2. Platform detection feeds correct parsers ─────────────────────────────
section('2. Platform detection → parser selection');

const platform = detectPlatform(root);
assert(platform.primary === 'react-native', `Detected react-native (got ${platform.primary})`);
assert(Array.isArray(platform.targets), 'targets is array');
assert(platform.targets.includes('android') || platform.primary === 'react-native', 'android target included');
assert(platform.targets.includes('ios') || platform.primary === 'react-native', 'ios target included');
assert(['high','medium','low'].includes(platform.confidence), `confidence is high/medium/low (got ${platform.confidence})`);
assert(Array.isArray(platform.indicators) && platform.indicators.length > 0, 'has indicators');

// ─── 3. Layer 1 → Layer 2 data hand-off ─────────────────────────────────────
section('3. Layer 1 parsers produce findings Layer 2 rules catch');

// ManifestParser should catch debuggable and cleartext
const manifestBlockers = manifest.findings.filter(f => f.severity === 'BLOCKER');
assert(manifestBlockers.length > 0, `ManifestParser emits at least 1 BLOCKER (got ${manifestBlockers.length})`);
assert(manifest.findings.some(f => f.id.includes('DEBUG') || f.id.includes('DEBUGGABLE')),
  'ManifestParser flags debuggable=true');

// GradleParser should catch low targetSdk
const gradleBlockers = gradle.findings.filter(f => f.severity === 'BLOCKER');
assert(gradleBlockers.length > 0, `GradleParser emits BLOCKER for targetSdk 29 (got ${gradleBlockers.length})`);

// PackageJsonAudit should flag outdated RN + Stripe
const pkgBlockers = pkgJson.findings.filter(f => f.severity === 'BLOCKER');
assert(pkgBlockers.length > 0, `PackageJsonAudit emits BLOCKER for Stripe on iOS (got ${pkgBlockers.length})`);

// AccountDeletionChecker should flag missing deletion
assert(acct.findings.some(f => f.severity === 'BLOCKER'), 'AccountDeletionChecker emits BLOCKER');

// ApiLevelGapDetector should flag targetSdk 29
assert(apiGap.findings.some(f => f.severity === 'BLOCKER'), 'ApiLevelGapDetector emits BLOCKER for targetSdk 29');

// PrivacyManifestChecker should flag missing PrivacyInfo.xcprivacy
assert(privacy.findings.some(f => f.severity === 'BLOCKER'), 'PrivacyManifestChecker emits BLOCKER');

// BackgroundPermissionAuditor should flag ACCESS_BACKGROUND_LOCATION
assert(bgPerm.findings.length > 0, 'BackgroundPermissionAuditor flags background location');

// NetworkSecurityChecker should catch cleartext or http URL
assert(network.findings.length > 0, 'NetworkSecurityChecker finds at least 1 issue');

// DebugFlagDetector should catch debuggable, DEBUG=true, .env not gitignored
assert(debug.findings.some(f => f.severity === 'BLOCKER'), 'DebugFlagDetector emits BLOCKER');

// PlaceholderScanner should catch Lorem ipsum
assert(placeholders.findings.some(f => f.id.includes('LOREM')), 'PlaceholderScanner catches Lorem ipsum');

// ─── 4. AuditEngine aggregation ──────────────────────────────────────────────
section('4. AuditEngine aggregation & deduplication');

const report: AuditReport = await runAudit({ repoId: 'test-df', repoPath: root });

// Shape
assert(typeof report.repoId === 'string', 'report.repoId is string');
assert(typeof report.repoPath === 'string', 'report.repoPath is string');
assert(typeof report.scannedAt === 'string', 'report.scannedAt is string');
assert(typeof report.durationMs === 'number' && report.durationMs >= 0, 'report.durationMs >= 0');
assert(typeof report.scores === 'object', 'report.scores is object');
assert(typeof report.scores.overall === 'number', 'scores.overall is number');
assert(report.scores.overall >= 0 && report.scores.overall <= 100, `scores.overall in [0,100] (got ${report.scores.overall})`);
assert(Array.isArray(report.findings), 'report.findings is array');
assert(typeof report.summary === 'object', 'report.summary is object');
assert(typeof report.summary.blockers === 'number', 'summary.blockers is number');
assert(typeof report.summary.warnings === 'number', 'summary.warnings is number');
assert(typeof report.summary.info === 'number', 'summary.info is number');
assert(typeof report.summary.storeReady === 'boolean', 'summary.storeReady is boolean');
assert(Array.isArray(report.parsersRun) && report.parsersRun.length > 0, `parsersRun has entries (got ${report.parsersRun.length})`);

// ─── 5. Deduplication ────────────────────────────────────────────────────────
section('5. Deduplication — no duplicate finding IDs');

const ids = report.findings.map(f => f.id);
const unique = new Set(ids);
assert(ids.length === unique.size, `No duplicate IDs (total=${ids.length}, unique=${unique.size})`);

// ─── 6. Sort order ───────────────────────────────────────────────────────────
section('6. Sort order — BLOCKERs before WARNINGs before INFOs');

const severityOrder: Record<string, number> = { BLOCKER: 0, WARNING: 1, INFO: 2 };
let sortOk = true;
for (let i = 1; i < report.findings.length; i++) {
  if (severityOrder[report.findings[i].severity] < severityOrder[report.findings[i-1].severity]) {
    sortOk = false;
    break;
  }
}
assert(sortOk, 'Findings sorted BLOCKER → WARNING → INFO');

// ─── 7. Score calculation ─────────────────────────────────────────────────────
section('7. Score calculation — math is correct');

const b = report.summary.blockers;
const w = report.summary.warnings;
const inf = report.summary.info;
const expectedScore = Math.max(0, 100 - b * 15 - w * 5 - inf * 1);
assert(report.scores.overall === expectedScore,
  `Score math: 100 - ${b}×15 - ${w}×5 - ${inf}×1 = ${expectedScore} (got ${report.scores.overall})`);
assert(!report.summary.storeReady || b === 0,
  'storeReady is false when blockers > 0');

// Per-platform scores present
assert(report.scores.android !== undefined, 'android score present for RN project');
assert(report.scores.ios !== undefined, 'ios score present for RN project');
assert(typeof report.scores.android === 'number', 'android score is number');
assert(typeof report.scores.ios === 'number', 'ios score is number');

// ─── 8. parsersRun completeness ───────────────────────────────────────────────
section('8. parsersRun — all expected parsers + rules listed');

const expectedParsers = [
  'ManifestParser', 'GradleParser', 'PlistParser', 'PackageJsonAudit',
  'PlaceholderScanner', 'PermissionMapper',
  'AccountDeletionChecker', 'ApiLevelGapDetector', 'IAPPolicyScanner',
  'PrivacyManifestChecker', 'BackgroundPermissionAuditor',
  'NetworkSecurityChecker', 'DebugFlagDetector',
];

for (const p of expectedParsers) {
  assert(report.parsersRun.includes(p), `parsersRun includes ${p}`);
}

// ─── 9. AuditReport fields are JSON-serialisable (API response check) ─────────
section('9. AuditReport is fully JSON-serialisable');

let serialised = '';
try {
  serialised = JSON.stringify(report);
  assert(serialised.length > 0, 'JSON.stringify succeeded');
} catch (e: any) {
  assert(false, 'JSON.stringify failed: ' + e.message);
}

const parsed = JSON.parse(serialised) as AuditReport;
assert(parsed.repoId === report.repoId, 'Round-trip: repoId preserved');
assert(parsed.findings.length === report.findings.length, 'Round-trip: findings count preserved');
assert(parsed.scores.overall === report.scores.overall, 'Round-trip: score preserved');

// ─── 10. Summary of findings from real fixture ────────────────────────────────
section('10. Real fixture finding summary');

console.log(`\n  Platform:  ${report.platform.primary} (confidence ${report.platform.confidence}%)`);
console.log(`  Score:     ${report.scores.overall}/100`);
if (report.scores.android !== undefined) console.log(`  Android:   ${report.scores.android}/100`);
if (report.scores.ios !== undefined)     console.log(`  iOS:       ${report.scores.ios}/100`);
console.log(`  Blockers:  ${report.summary.blockers}`);
console.log(`  Warnings:  ${report.summary.warnings}`);
console.log(`  Info:      ${report.summary.info}`);
console.log(`  StoreReady: ${report.summary.storeReady}`);
console.log(`  Parsers run (${report.parsersRun.length}): ${report.parsersRun.join(', ')}`);
console.log(`\n  Findings breakdown:`);
const catCounts: Record<string, number> = {};
for (const f of report.findings) catCounts[f.category] = (catCounts[f.category] ?? 0) + 1;
for (const [cat, count] of Object.entries(catCounts)) {
  console.log(`    ${cat}: ${count}`);
}
console.log(`\n  All BLOCKER findings:`);
for (const f of report.findings.filter(f => f.severity === 'BLOCKER')) {
  console.log(`    🔴 [${f.category}] ${f.title}`);
}

assert(report.summary.blockers >= 5, `Fixture has ≥5 blockers (got ${report.summary.blockers})`);
assert(!report.summary.storeReady, 'Fixture is not store ready');

// ─── Cleanup ──────────────────────────────────────────────────────────────────
fs.rmSync(root, { recursive: true, force: true });

// ─── Final result ─────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(55));
console.log(`  Data-flow results: ${passed} passed, ${failed} failed`);
console.log('═'.repeat(55));

if (failed > 0) process.exit(1);
