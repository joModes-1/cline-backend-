/**
 * Villa Audit Engine — End-to-End Pipeline Test
 *
 * Creates synthetic repo structures on disk, runs the full audit engine,
 * and validates that the correct findings are emitted.
 *
 * Run: npx tsx src/services/audit/__tests__/audit-e2e.test.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { runAudit } from '../AuditEngine';
import { detectPlatform } from '../MultiPlatformDetector';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function createTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'villa-audit-test-'));
}

function write(base: string, rel: string, content: string): void {
  const full = path.join(base, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf-8');
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

// ─── Test runner (no external test framework needed) ─────────────────────────
let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

// ─── Test suites ──────────────────────────────────────────────────────────────

async function testMultiPlatformDetector(): Promise<void> {
  console.log('\n📦 MultiPlatformDetector');

  // Flutter
  const flutter = createTmpDir();
  write(flutter, 'pubspec.yaml', 'name: my_app\nversion: 1.0.0');
  write(flutter, 'lib/main.dart', 'void main() {}');
  const fp = detectPlatform(flutter);
  assert(fp.primary === 'flutter', `Flutter detected (got ${fp.primary})`);
  cleanup(flutter);

  // Native Android
  const android = createTmpDir();
  write(android, 'app/src/main/AndroidManifest.xml', '<manifest></manifest>');
  write(android, 'build.gradle', 'android {}');
  const ap = detectPlatform(android);
  assert(ap.primary === 'android', `Android detected (got ${ap.primary})`);
  cleanup(android);

  // React Native
  const rn = createTmpDir();
  write(rn, 'package.json', JSON.stringify({ name: 'MyApp', dependencies: { 'react-native': '0.73.0' } }));
  write(rn, 'metro.config.js', 'module.exports = {}');
  write(rn, 'android/app/src/main/AndroidManifest.xml', '<manifest></manifest>');
  const rnp = detectPlatform(rn);
  assert(rnp.primary === 'react-native', `React Native detected (got ${rnp.primary})`);
  cleanup(rn);
}

async function testManifestParser(): Promise<void> {
  console.log('\n📋 ManifestParser');

  const dir = createTmpDir();
  write(dir, 'app/src/main/AndroidManifest.xml', `
    <manifest package="com.example.app">
      <uses-permission android:name="android.permission.CAMERA"/>
      <uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION"/>
      <application android:debuggable="true" android:usesCleartextTraffic="true">
      </application>
    </manifest>
  `);

  const report = await runAudit({ repoId: 'test', repoPath: dir, skipParsers: ['PlaceholderScanner', 'PlistParser', 'GradleParser', 'PermissionMapper'] });

  assert(report.findings.some(f => f.id.includes('DEBUGGABLE')), 'Detects debuggable flag');
  assert(report.findings.some(f => f.id.includes('CLEARTEXT')), 'Detects cleartext traffic');
  assert(report.findings.some(f => f.id.includes('BACKGROUND_LOCATION') || f.id.includes('BG_PERM')), 'Detects background location permission');
  assert(report.findings.some(f => f.severity === 'BLOCKER'), 'Has at least one BLOCKER');

  cleanup(dir);
}

async function testGradleParser(): Promise<void> {
  console.log('\n🔧 GradleParser');

  const dir = createTmpDir();
  write(dir, 'app/build.gradle', `
    android {
      compileSdkVersion 33
      defaultConfig {
        targetSdkVersion 31
        minSdkVersion 19
        versionName "1.0"
      }
    }
  `);

  const report = await runAudit({ repoId: 'test', repoPath: dir, skipParsers: ['ManifestParser', 'PlistParser', 'PlaceholderScanner', 'PermissionMapper', 'PubspecParser', 'PackageJsonAudit'] });

  assert(report.findings.some(f => f.id === 'GRADLE_TARGET_SDK_LOW'), 'Detects targetSdk below minimum');
  const sdkFinding = report.findings.find(f => f.id === 'GRADLE_TARGET_SDK_LOW');
  assert(sdkFinding?.severity === 'BLOCKER', 'targetSdk finding is BLOCKER');

  cleanup(dir);
}

async function testPubspecParser(): Promise<void> {
  console.log('\n🐦 PubspecParser');

  const dir = createTmpDir();
  write(dir, 'pubspec.yaml', `
name: my_flutter_app
version: 1.0.0+1
environment:
  sdk: '>=2.17.0 <3.0.0'
dependencies:
  flutter:
    sdk: flutter
  flutter_stripe: ^9.0.0
  url_launcher: ^6.0.0
`);
  write(dir, 'lib/main.dart', 'void main() {}');

  const report = await runAudit({ repoId: 'test', repoPath: dir, skipParsers: ['ManifestParser', 'PlistParser', 'GradleParser', 'PlaceholderScanner', 'PermissionMapper', 'PackageJsonAudit'] });

  assert(report.findings.some(f => f.id === 'PUBSPEC_DART_SDK_LOW'), 'Detects outdated Dart SDK');
  assert(report.findings.some(f => f.id === 'PUBSPEC_PKG_FLUTTER_STRIPE'), 'Detects flutter_stripe BLOCKER');
  const stripeFinding = report.findings.find(f => f.id === 'PUBSPEC_PKG_FLUTTER_STRIPE');
  assert(stripeFinding?.severity === 'BLOCKER', 'flutter_stripe is BLOCKER on iOS');

  cleanup(dir);
}

async function testPlaceholderScanner(): Promise<void> {
  console.log('\n🔍 PlaceholderScanner');

  const dir = createTmpDir();
  write(dir, 'src/screens/Home.tsx', `
    export function Home() {
      return <Text>Lorem ipsum dolor sit amet</Text>;
    }
  `);
  write(dir, 'src/config.ts', `
    const API_KEY = 'pk_test_abc123def456';
    const SUPPORT_EMAIL = 'test@test.com';
    const apiUrl = 'https://example.com/api';
  `);

  const report = await runAudit({ repoId: 'test', repoPath: dir, skipParsers: ['ManifestParser', 'PlistParser', 'GradleParser', 'PermissionMapper', 'PubspecParser', 'PackageJsonAudit'] });

  assert(report.findings.some(f => f.id.startsWith('PLACEHOLDER_LOREM')), 'Detects Lorem Ipsum');
  assert(report.findings.some(f => f.id.startsWith('PLACEHOLDER_HARDCODED_TEST_KEY')), 'Detects Stripe test key');
  assert(report.findings.some(f => f.id.startsWith('PLACEHOLDER_TEST_EMAIL')), 'Detects test email');
  assert(report.findings.some(f => f.id.startsWith('PLACEHOLDER_EXAMPLE_DOMAIN')), 'Detects example.com URL');

  cleanup(dir);
}

async function testPackageJsonAudit(): Promise<void> {
  console.log('\n📦 PackageJsonAudit');

  const dir = createTmpDir();
  write(dir, 'package.json', JSON.stringify({
    name: 'my-rn-app',
    version: '1.0.0',
    dependencies: {
      'react-native': '0.68.0',
      '@stripe/stripe-react-native': '^0.30.0',
      'expo': '48.0.0',
    },
    engines: { node: '>=14' },
  }, null, 2));
  write(dir, 'metro.config.js', 'module.exports = {}');
  write(dir, 'index.js', 'import App from "./App"');
  write(dir, 'android/app/src/main/AndroidManifest.xml', '<manifest></manifest>');

  const report = await runAudit({ repoId: 'test', repoPath: dir, skipParsers: ['ManifestParser', 'PlistParser', 'GradleParser', 'PlaceholderScanner', 'PermissionMapper', 'PubspecParser'] });

  assert(report.findings.some(f => f.id === 'PKG_RN_OUTDATED'), 'Detects outdated React Native');
  assert(report.findings.some(f => f.id.includes('STRIPE')), 'Detects Stripe as BLOCKER on iOS');
  assert(report.findings.some(f => f.id === 'PKG_NODE_VERSION_OLD'), 'Detects outdated Node engine');

  cleanup(dir);
}

async function testScoring(): Promise<void> {
  console.log('\n📊 Scoring');

  const dir = createTmpDir();
  // Clean repo — no issues
  write(dir, 'src/index.ts', 'console.log("hello world");');

  const report = await runAudit({ repoId: 'test', repoPath: dir });

  assert(report.scores.overall >= 0 && report.scores.overall <= 100, 'Score in valid range 0-100');
  assert(typeof report.summary.storeReady === 'boolean', 'storeReady is boolean');
  assert(typeof report.durationMs === 'number', 'durationMs is a number');
  assert(report.parsersRun.length > 0, 'At least one parser ran');
  assert(typeof report.scannedAt === 'string', 'scannedAt is set');

  cleanup(dir);
}

async function testFullPipelineReactNative(): Promise<void> {
  console.log('\n🚀 Full Pipeline — React Native app with multiple issues');

  const dir = createTmpDir();

  // package.json
  write(dir, 'package.json', JSON.stringify({
    name: 'ProblemApp',
    version: '1.0.0',
    dependencies: {
      'react-native': '0.71.0',
      '@stripe/stripe-react-native': '^0.30.0',
    },
  }, null, 2));

  // Android manifest with issues
  write(dir, 'android/app/src/main/AndroidManifest.xml', `
    <manifest package="com.problemapp">
      <uses-permission android:name="android.permission.CAMERA"/>
      <uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION"/>
      <uses-permission android:name="android.permission.READ_SMS"/>
      <application android:debuggable="true" android:usesCleartextTraffic="true">
        <activity android:name=".MainActivity" android:exported="true"/>
        <activity android:name=".PayActivity" android:exported="true"/>
        <activity android:name=".AdminActivity" android:exported="true"/>
      </application>
    </manifest>
  `);

  // Gradle with old SDK
  write(dir, 'app/build.gradle', `
    android {
      compileSdkVersion 33
      defaultConfig {
        targetSdkVersion 30
        minSdkVersion 16
        versionName "0.1"
      }
    }
  `);

  // JS with placeholder content
  write(dir, 'src/Home.tsx', `
    export const Home = () => <View><Text>Lorem ipsum</Text><Text>Coming Soon</Text></View>
    const key = 'pk_test_fakekeyfortesting123';
  `);

  // metro (RN signal)
  write(dir, 'metro.config.js', 'module.exports = {}');
  write(dir, 'index.js', 'import App from "./App"');

  const report = await runAudit({ repoId: 'problem-app', repoPath: dir });

  console.log(`\n  Platform: ${report.platform.primary} (${report.platform.confidence} confidence)`);
  console.log(`  Score: ${report.scores.overall}/100`);
  console.log(`  Blockers: ${report.summary.blockers} | Warnings: ${report.summary.warnings} | Info: ${report.summary.info}`);
  console.log(`  Store Ready: ${report.summary.storeReady}`);
  console.log(`  Parsers run: ${report.parsersRun.join(', ')}`);

  assert(report.platform.primary === 'react-native', `Detected react-native (got ${report.platform.primary})`);
  assert(report.summary.blockers > 0, 'Has blockers');
  assert(report.scores.overall < 50, `Score penalized appropriately (${report.scores.overall})`);
  assert(!report.summary.storeReady, 'Not store ready');
  assert(report.findings.length > 3, `Multiple findings emitted (${report.findings.length})`);

  // Print all findings
  console.log('\n  Findings:');
  for (const f of report.findings) {
    const icon = f.severity === 'BLOCKER' ? '🔴' : f.severity === 'WARNING' ? '🟡' : '🔵';
    console.log(`    ${icon} [${f.severity}] ${f.title}`);
  }

  cleanup(dir);
}

// ─── Runner ───────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Villa Audit Engine — End-to-End Test Suite');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await testMultiPlatformDetector();
  await testManifestParser();
  await testGradleParser();
  await testPubspecParser();
  await testPlaceholderScanner();
  await testPackageJsonAudit();
  await testScoring();
  await testFullPipelineReactNative();

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
