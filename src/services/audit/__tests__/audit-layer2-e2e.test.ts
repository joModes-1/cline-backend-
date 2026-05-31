/**
 * Villa Audit Engine — Layer 2 Compliance Rules E2E Test Suite
 * Run: npx tsx src/services/audit/__tests__/audit-layer2-e2e.test.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { checkAccountDeletion } from '../rules/AccountDeletionChecker';
import { detectApiLevelGaps } from '../rules/ApiLevelGapDetector';
import { scanIAPPolicy } from '../rules/IAPPolicyScanner';
import { checkPrivacyManifest } from '../rules/PrivacyManifestChecker';
import { auditBackgroundPermissions } from '../rules/BackgroundPermissionAuditor';
import { checkNetworkSecurity } from '../rules/NetworkSecurityChecker';
import { detectDebugFlags } from '../rules/DebugFlagDetector';
import { runAudit } from '../AuditEngine';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function tmp(): string { return fs.mkdtempSync(path.join(os.tmpdir(), 'va-l2-')); }
function write(base: string, rel: string, content: string): void {
  const full = path.join(base, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf-8');
}
function cleanup(dir: string): void { fs.rmSync(dir, { recursive: true, force: true }); }

let passed = 0; let failed = 0;
function assert(cond: boolean, msg: string): void {
  if (cond) { console.log(`  ✅ ${msg}`); passed++; }
  else { console.error(`  ❌ FAIL: ${msg}`); failed++; }
}

// ─── AccountDeletionChecker ───────────────────────────────────────────────────
async function testAccountDeletion(): Promise<void> {
  console.log('\n🗑️  AccountDeletionChecker');

  // App with signup but NO deletion
  const d1 = tmp();
  write(d1, 'src/screens/SignUp.tsx', 'export const SignUp = () => { createAccount(); signUp(); }');
  const r1 = checkAccountDeletion(d1);
  assert(r1.findings.some(f => f.id === 'COMPLIANCE_NO_ACCOUNT_DELETION'), 'Flags missing deletion when signup exists');
  assert(r1.findings[0]?.severity === 'BLOCKER', 'Missing deletion is BLOCKER');
  cleanup(d1);

  // App with both signup AND deletion
  const d2 = tmp();
  write(d2, 'src/auth.ts', 'function signUp() {} function deleteAccount() {}');
  const r2 = checkAccountDeletion(d2);
  assert(!r2.findings.some(f => f.id === 'COMPLIANCE_NO_ACCOUNT_DELETION'), 'No false positive when deletion exists');
  cleanup(d2);

  // App with no account logic at all
  const d3 = tmp();
  write(d3, 'src/app.ts', 'console.log("hello world")');
  const r3 = checkAccountDeletion(d3);
  assert(r3.findings.some(f => f.id === 'COMPLIANCE_ACCOUNT_DELETION_UNVERIFIED'), 'Emits INFO when no account signals found');
  cleanup(d3);

  // Firebase auth with deletion
  const d4 = tmp();
  write(d4, 'src/auth.ts', `
    import { createUserWithEmailAndPassword, deleteUser } from 'firebase/auth';
    async function register() { await createUserWithEmailAndPassword(auth, email, pass); }
    async function remove() { await deleteUser(currentUser); }
  `);
  const r4 = checkAccountDeletion(d4);
  assert(!r4.findings.some(f => f.severity === 'BLOCKER'), 'Firebase with deleteUser is not flagged');
  cleanup(d4);
}

// ─── ApiLevelGapDetector ─────────────────────────────────────────────────────
async function testApiLevelGaps(): Promise<void> {
  console.log('\n📡 ApiLevelGapDetector');

  // Below minimum targetSdk
  const d1 = tmp();
  write(d1, 'app/build.gradle', `android { compileSdkVersion 33\n defaultConfig { targetSdkVersion 30\n minSdkVersion 21 } }`);
  const r1 = detectApiLevelGaps(d1);
  assert(r1.findings.some(f => f.id === 'API_ANDROID_TARGET_SDK_BELOW_MINIMUM'), 'Detects targetSdk below minimum');
  assert(r1.findings.find(f => f.id === 'API_ANDROID_TARGET_SDK_BELOW_MINIMUM')?.severity === 'BLOCKER', 'targetSdk gap is BLOCKER');
  cleanup(d1);

  // Correct targetSdk
  const d2 = tmp();
  write(d2, 'app/build.gradle', `android { compileSdkVersion 34\n defaultConfig { targetSdkVersion 34\n minSdkVersion 24 } }`);
  const r2 = detectApiLevelGaps(d2);
  assert(!r2.findings.some(f => f.id === 'API_ANDROID_TARGET_SDK_BELOW_MINIMUM'), 'No false positive on correct targetSdk');
  cleanup(d2);

  // compileSdk < targetSdk mismatch
  const d3 = tmp();
  write(d3, 'app/build.gradle', `android { compileSdkVersion 32\n defaultConfig { targetSdkVersion 34\n minSdkVersion 21 } }`);
  const r3 = detectApiLevelGaps(d3);
  assert(r3.findings.some(f => f.id === 'API_ANDROID_COMPILE_SDK_MISMATCH'), 'Detects compileSdk < targetSdk');
  cleanup(d3);

  // Very low minSdk
  const d4 = tmp();
  write(d4, 'app/build.gradle', `android { compileSdkVersion 34\n defaultConfig { targetSdkVersion 34\n minSdkVersion 14 } }`);
  const r4 = detectApiLevelGaps(d4);
  assert(r4.findings.some(f => f.id === 'API_ANDROID_MIN_SDK_CRITICAL'), 'Detects critically low minSdk');
  cleanup(d4);

  // iOS deployment target from Podfile
  const d5 = tmp();
  write(d5, 'ios/Podfile', `platform :ios, '12.0'\ntarget 'MyApp' do\nend`);
  const r5 = detectApiLevelGaps(d5);
  assert(r5.findings.some(f => f.id === 'API_IOS_DEPLOYMENT_TARGET_LOW'), 'Detects low iOS deployment target');
  cleanup(d5);
}

// ─── IAPPolicyScanner ─────────────────────────────────────────────────────────
async function testIAPPolicy(): Promise<void> {
  console.log('\n💳 IAPPolicyScanner');

  // Stripe in iOS project — BLOCKER
  const d1 = tmp();
  write(d1, 'ios/Info.plist', '<plist></plist>');
  write(d1, 'package.json', JSON.stringify({ dependencies: { '@stripe/stripe-react-native': '^0.30.0' } }));
  write(d1, 'src/Pay.tsx', `import { useStripe } from '@stripe/stripe-react-native'; const Pay = () => useStripe();`);
  const r1 = scanIAPPolicy(d1);
  assert(r1.findings.some(f => f.severity === 'BLOCKER' && f.platform === 'ios'), 'Stripe on iOS is BLOCKER');
  cleanup(d1);

  // Stripe in Android-only project — INFO only
  const d2 = tmp();
  write(d2, 'android/app/src/main/AndroidManifest.xml', '<manifest></manifest>');
  write(d2, 'src/pay.js', `import Stripe from 'stripe'; Stripe.init('pk_live_xxx');`);
  const r2 = scanIAPPolicy(d2);
  assert(!r2.findings.some(f => f.severity === 'BLOCKER'), 'Stripe on Android-only is not BLOCKER');
  cleanup(d2);

  // RevenueCat — INFO only (compliant)
  const d3 = tmp();
  write(d3, 'ios/Podfile', 'platform :ios, "16.0"');
  write(d3, 'src/purchases.ts', `import Purchases from 'react-native-purchases'; Purchases.configure({ apiKey: 'xxx' });`);
  const r3 = scanIAPPolicy(d3);
  assert(r3.findings.every(f => f.severity !== 'BLOCKER'), 'RevenueCat is not flagged as BLOCKER');
  assert(r3.findings.some(f => f.id === 'IAP_REVENUECAT_DETECTED'), 'RevenueCat emits INFO finding');
  cleanup(d3);

  // No IAP at all — no findings
  const d4 = tmp();
  write(d4, 'ios/Info.plist', '<plist></plist>');
  write(d4, 'src/app.ts', 'console.log("no payments here")');
  const r4 = scanIAPPolicy(d4);
  assert(r4.findings.length === 0, 'No IAP findings when no payment SDKs present');
  cleanup(d4);
}

// ─── PrivacyManifestChecker ───────────────────────────────────────────────────
async function testPrivacyManifest(): Promise<void> {
  console.log('\n🔒 PrivacyManifestChecker');

  // iOS project with no PrivacyInfo.xcprivacy
  const d1 = tmp();
  write(d1, 'ios/Info.plist', '<plist></plist>');
  const r1 = checkPrivacyManifest(d1);
  assert(r1.findings.some(f => f.id === 'PRIVACY_MANIFEST_MISSING'), 'Detects missing PrivacyInfo.xcprivacy');
  assert(r1.findings[0]?.severity === 'BLOCKER', 'Missing manifest is BLOCKER');
  cleanup(d1);

  // iOS project with manifest but missing NSPrivacyTracking
  const d2 = tmp();
  write(d2, 'ios/Info.plist', '<plist></plist>');
  write(d2, 'ios/PrivacyInfo.xcprivacy', `<?xml version="1.0"?>
    <plist><dict>
      <key>NSPrivacyCollectedDataTypes</key><array/>
      <key>NSPrivacyAccessedAPITypes</key><array/>
    </dict></plist>`);
  const r2 = checkPrivacyManifest(d2);
  assert(r2.findings.some(f => f.id === 'PRIVACY_MANIFEST_NO_TRACKING_KEY'), 'Detects missing NSPrivacyTracking');
  cleanup(d2);

  // Complete valid manifest — no blockers
  const d3 = tmp();
  write(d3, 'ios/Info.plist', '<plist></plist>');
  write(d3, 'ios/PrivacyInfo.xcprivacy', `<?xml version="1.0"?>
    <plist><dict>
      <key>NSPrivacyTracking</key><false/>
      <key>NSPrivacyCollectedDataTypes</key><array/>
      <key>NSPrivacyAccessedAPITypes</key><array/>
    </dict></plist>`);
  const r3 = checkPrivacyManifest(d3);
  assert(!r3.findings.some(f => f.severity === 'BLOCKER'), 'Complete manifest has no blockers');
  cleanup(d3);

  // Non-iOS project — skipped
  const d4 = tmp();
  write(d4, 'android/app/src/main/AndroidManifest.xml', '<manifest></manifest>');
  const r4 = checkPrivacyManifest(d4);
  assert((r4.metadata as any)?.skipped === true, 'Skips non-iOS projects');
  cleanup(d4);
}

// ─── BackgroundPermissionAuditor ──────────────────────────────────────────────
async function testBackgroundPermissions(): Promise<void> {
  console.log('\n🔄 BackgroundPermissionAuditor');

  // Background location with NO source justification
  const d1 = tmp();
  write(d1, 'app/src/main/AndroidManifest.xml', `
    <manifest>
      <uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION"/>
    </manifest>`);
  write(d1, 'src/app.ts', 'console.log("no location code here")');
  const r1 = auditBackgroundPermissions(d1);
  assert(r1.findings.some(f => f.id.includes('UNJUSTIFIED') && f.id.includes('BACKGROUND_LOCATION')), 'Detects unjustified background location');
  assert(r1.findings[0]?.severity === 'BLOCKER', 'Unjustified background location is BLOCKER');
  cleanup(d1);

  // Background location WITH justification in source
  const d2 = tmp();
  write(d2, 'app/src/main/AndroidManifest.xml', `
    <manifest>
      <uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION"/>
    </manifest>`);
  write(d2, 'src/LocationService.ts', 'startLocationUpdatesAsync({ accuracy: "high" }); BackgroundLocation.startAsync();');
  const r2 = auditBackgroundPermissions(d2);
  assert(!r2.findings.some(f => f.id.includes('UNJUSTIFIED') && f.id.includes('BACKGROUND_LOCATION')), 'No unjustified flag when usage found');
  // But should still require Play Declaration
  assert(r2.findings.some(f => f.id.includes('DECLARATION_REQUIRED')), 'Requires Play Declaration Form even when justified');
  cleanup(d2);

  // SYSTEM_ALERT_WINDOW — always high risk
  const d3 = tmp();
  write(d3, 'app/src/main/AndroidManifest.xml', `
    <manifest>
      <uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW"/>
    </manifest>`);
  write(d3, 'src/overlay.ts', 'console.log("no overlay code")');
  const r3 = auditBackgroundPermissions(d3);
  assert(r3.findings.some(f => f.id.includes('SYSTEM_ALERT_WINDOW')), 'Detects unjustified SYSTEM_ALERT_WINDOW');
  cleanup(d3);

  // No manifest — graceful skip
  const d4 = tmp();
  write(d4, 'src/app.ts', 'hello');
  const r4 = auditBackgroundPermissions(d4);
  assert(r4.findings.length === 0, 'No findings when no manifest found');
  cleanup(d4);
}

// ─── NetworkSecurityChecker ───────────────────────────────────────────────────
async function testNetworkSecurity(): Promise<void> {
  console.log('\n🌐 NetworkSecurityChecker');

  // Cleartext traffic in Android manifest
  const d1 = tmp();
  write(d1, 'app/src/main/AndroidManifest.xml', `
    <manifest>
      <application android:usesCleartextTraffic="true">
      </application>
    </manifest>`);
  const r1 = checkNetworkSecurity(d1);
  assert(r1.findings.some(f => f.id === 'NETWORK_ANDROID_CLEARTEXT_TRAFFIC'), 'Detects cleartext traffic flag');
  cleanup(d1);

  // iOS ATS disabled
  const d2 = tmp();
  write(d2, 'ios/Info.plist', `
    <plist><dict>
      <key>NSAppTransportSecurity</key>
      <dict>
        <key>NSAllowsArbitraryLoads</key><true/>
      </dict>
    </dict></plist>`);
  const r2 = checkNetworkSecurity(d2);
  assert(r2.findings.some(f => f.id === 'NETWORK_IOS_ATS_DISABLED'), 'Detects NSAllowsArbitraryLoads=true');
  cleanup(d2);

  // Hardcoded HTTP URLs in source
  const d3 = tmp();
  write(d3, 'src/api.ts', `const BASE_URL = 'http://api.myproductionapp.com/v1';`);
  const r3 = checkNetworkSecurity(d3);
  assert(r3.findings.some(f => f.id === 'NETWORK_HARDCODED_HTTP_URLS'), 'Detects hardcoded HTTP URLs');
  cleanup(d3);

  // localhost HTTP — should NOT flag
  const d4 = tmp();
  write(d4, 'src/dev.ts', `const DEV_URL = 'http://localhost:3000/api';`);
  const r4 = checkNetworkSecurity(d4);
  assert(!r4.findings.some(f => f.id === 'NETWORK_HARDCODED_HTTP_URLS'), 'localhost HTTP is not flagged');
  cleanup(d4);

  // network_security_config with user cert trust
  const d5 = tmp();
  write(d5, 'app/src/main/AndroidManifest.xml', `
    <manifest>
      <application android:networkSecurityConfig="@xml/network_security_config"/>
    </manifest>`);
  write(d5, 'app/src/main/res/xml/network_security_config.xml', `
    <network-security-config>
      <base-config>
        <trust-anchors>
          <certificates src="user"/>
        </trust-anchors>
      </base-config>
    </network-security-config>`);
  const r5 = checkNetworkSecurity(d5);
  assert(r5.findings.some(f => f.id === 'NETWORK_TRUSTS_USER_CERTIFICATES'), 'Detects user cert trust in base config');
  assert(r5.findings.find(f => f.id === 'NETWORK_TRUSTS_USER_CERTIFICATES')?.severity === 'BLOCKER', 'User cert trust is BLOCKER');
  cleanup(d5);
}

// ─── DebugFlagDetector ────────────────────────────────────────────────────────
async function testDebugFlags(): Promise<void> {
  console.log('\n🐛 DebugFlagDetector');

  // android:debuggable="true" in manifest
  const d1 = tmp();
  write(d1, 'app/src/main/AndroidManifest.xml', `
    <manifest>
      <application android:debuggable="true">
      </application>
    </manifest>`);
  const r1 = detectDebugFlags(d1);
  assert(r1.findings.some(f => f.id === 'DEBUG_ANDROID_DEBUGGABLE'), 'Detects android:debuggable=true');
  assert(r1.findings[0]?.severity === 'BLOCKER', 'debuggable is BLOCKER');
  cleanup(d1);

  // Release build using debug signing
  const d2 = tmp();
  write(d2, 'app/build.gradle', `
    android {
      buildTypes {
        release {
          signingConfig signingConfigs.debug
          minifyEnabled true
        }
      }
    }`);
  const r2 = detectDebugFlags(d2);
  assert(r2.findings.some(f => f.id === 'DEBUG_GRADLE_SIGNING_DEBUG'), 'Detects release with debug signing');
  cleanup(d2);

  // Minification disabled in release
  const d3 = tmp();
  write(d3, 'app/build.gradle', `
    android {
      buildTypes {
        release {
          minifyEnabled false
        }
      }
    }`);
  const r3 = detectDebugFlags(d3);
  assert(r3.findings.some(f => f.id === 'DEBUG_GRADLE_MINIFY_DISABLED'), 'Detects minifyEnabled false in release');
  cleanup(d3);

  // DEBUG=true in .env
  const d4 = tmp();
  write(d4, '.env', 'DEBUG=true\nNODE_ENV=production');
  const r4 = detectDebugFlags(d4);
  assert(r4.findings.some(f => f.id === 'DEBUG_ENV_DEBUG_TRUE'), 'Detects DEBUG=true in .env');
  cleanup(d4);

  // NODE_ENV=development in .env.production
  const d5 = tmp();
  write(d5, '.env.production', 'NODE_ENV=development\nAPI_URL=https://api.myapp.com');
  const r5 = detectDebugFlags(d5);
  assert(r5.findings.some(f => f.id === 'DEBUG_ENV_NODE_ENV_DEVELOPMENT'), 'Detects NODE_ENV=development in prod env');
  cleanup(d5);

  // .env not in .gitignore
  const d6 = tmp();
  write(d6, '.env', 'SECRET_KEY=abc123');
  write(d6, '.gitignore', '# only ignoring build/\nbuild/\ndist/');
  const r6 = detectDebugFlags(d6);
  assert(r6.findings.some(f => f.id === 'DEBUG_ENV_NOT_GITIGNORED'), 'Detects .env not in .gitignore');
  assert(r6.findings.find(f => f.id === 'DEBUG_ENV_NOT_GITIGNORED')?.severity === 'BLOCKER', '.env not gitignored is BLOCKER');
  cleanup(d6);

  // Clean project — no flags
  const d7 = tmp();
  write(d7, 'src/app.ts', 'export default function App() {}');
  write(d7, '.gitignore', '.env\n.env.*\nlocal.properties');
  const r7 = detectDebugFlags(d7);
  assert(r7.findings.length === 0, 'No findings in clean project');
  cleanup(d7);
}

// ─── Full Layer 1 + 2 Integration Test ───────────────────────────────────────
async function testFullPipelineLayer2(): Promise<void> {
  console.log('\n🚀 Full Pipeline — Layer 1 + Layer 2 combined (React Native)');

  const dir = tmp();

  // package.json
  write(dir, 'package.json', JSON.stringify({
    name: 'BadApp', version: '0.1.0',
    dependencies: {
      'react-native': '0.68.0',
      '@stripe/stripe-react-native': '^0.30.0',
    },
  }, null, 2));
  write(dir, 'metro.config.js', 'module.exports = {}');
  write(dir, 'index.js', 'import App from "./App"');

  // iOS project
  write(dir, 'ios/Info.plist', `
    <plist><dict>
      <key>NSAppTransportSecurity</key>
      <dict><key>NSAllowsArbitraryLoads</key><true/></dict>
    </dict></plist>`);
  // No PrivacyInfo.xcprivacy

  // Android manifest with problems
  write(dir, 'android/app/src/main/AndroidManifest.xml', `
    <manifest package="com.badapp">
      <uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION"/>
      <uses-permission android:name="android.permission.MANAGE_EXTERNAL_STORAGE"/>
      <application android:debuggable="true" android:usesCleartextTraffic="true">
      </application>
    </manifest>`);

  // Gradle
  write(dir, 'app/build.gradle', `
    android {
      compileSdkVersion 32
      defaultConfig { targetSdkVersion 29\n minSdkVersion 16 }
      buildTypes { release { minifyEnabled false\n signingConfig signingConfigs.debug } }
    }`);

  // Source — signup with no deletion, Stripe usage, HTTP URL
  write(dir, 'src/screens/SignUp.tsx', `
    export function SignUp() { signUp(); createAccount(); }
  `);
  write(dir, 'src/api.ts', `
    const API = 'http://api.mybadapp.com/v1';
    import { useStripe } from '@stripe/stripe-react-native';
  `);

  // Debug env
  write(dir, '.env', 'DEBUG=true\nSTRIPE_KEY=pk_test_fakekey123');
  write(dir, '.gitignore', '# nothing useful');

  const report = await runAudit({ repoId: 'bad-app', repoPath: dir });

  console.log(`\n  Platform: ${report.platform.primary}`);
  console.log(`  Score: ${report.scores.overall}/100`);
  console.log(`  Blockers: ${report.summary.blockers} | Warnings: ${report.summary.warnings} | Info: ${report.summary.info}`);
  console.log(`  Store Ready: ${report.summary.storeReady}`);
  console.log(`  Parsers run: ${report.parsersRun.join(', ')}`);

  assert(report.platform.primary === 'react-native', `Platform is react-native (got ${report.platform.primary})`);
  assert(report.summary.blockers >= 5, `Has 5+ blockers (got ${report.summary.blockers})`);
  assert(!report.summary.storeReady, 'Not store ready');
  assert(report.scores.overall === 0, `Score is 0 (penalized to floor, got ${report.scores.overall})`);
  assert(report.parsersRun.length >= 10, `At least 10 parsers/rules ran (got ${report.parsersRun.length})`);

  // Specific Layer 2 findings
  assert(report.findings.some(f => f.id === 'COMPLIANCE_NO_ACCOUNT_DELETION'), 'AccountDeletion: flagged');
  assert(report.findings.some(f => f.id === 'API_ANDROID_TARGET_SDK_BELOW_MINIMUM'), 'ApiLevelGap: targetSdk flagged');
  assert(report.findings.some(f => f.platform === 'ios' && f.category === 'COMPLIANCE'), 'IAP/Privacy: iOS compliance finding');
  assert(report.findings.some(f => f.id === 'PRIVACY_MANIFEST_MISSING'), 'PrivacyManifest: missing flagged');
  assert(report.findings.some(f => f.id.includes('NETWORK')), 'Network: security issue flagged');
  assert(report.findings.some(f => f.id.includes('DEBUG')), 'Debug: flag detected');

  console.log('\n  Sample findings (blockers only):');
  for (const f of report.findings.filter(x => x.severity === 'BLOCKER').slice(0, 8)) {
    console.log(`    🔴 [${f.category}] ${f.title}`);
  }

  cleanup(dir);
}

// ─── Runner ───────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Villa Audit — Layer 2 Compliance Rules Test Suite');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await testAccountDeletion();
  await testApiLevelGaps();
  await testIAPPolicy();
  await testPrivacyManifest();
  await testBackgroundPermissions();
  await testNetworkSecurity();
  await testDebugFlags();
  await testFullPipelineLayer2();

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  if (failed > 0) process.exit(1);
}

main().catch(err => { console.error('Test error:', err); process.exit(1); });
