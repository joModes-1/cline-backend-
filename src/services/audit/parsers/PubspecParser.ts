import * as fs from 'fs';
import * as path from 'path';
import type { AuditFinding, ParserResult } from '../AuditTypes';
import { checkDependencies } from '../osv-client';
import { DART_MIN_SDK, FLUTTER_MIN_SDK } from '../policy-thresholds';

// ─── Flutter SDK minimum — sourced from policy-thresholds.ts ────────────────
const MIN_FLUTTER_SDK = FLUTTER_MIN_SDK;
const MIN_DART_SDK = DART_MIN_SDK;

// ─── Flagged Flutter packages ─────────────────────────────────────────────────
const FLAGGED_PACKAGES: { name: string; reason: string; severity: 'BLOCKER' | 'WARNING' | 'INFO'; fix: string }[] = [
  {
    name: 'url_launcher',
    reason: 'url_launcher can open external payment pages — verify this does not bypass Apple IAP.',
    severity: 'WARNING',
    fix: 'Ensure url_launcher is not used to redirect users to external subscription/payment flows on iOS.',
  },
  {
    name: 'in_app_purchase',
    reason: 'IAP package detected. Ensure it is correctly implemented for both iOS (StoreKit) and Android (Play Billing).',
    severity: 'INFO',
    fix: 'Verify in_app_purchase uses native APIs and not a third-party payment gateway on iOS.',
  },
  {
    name: 'flutter_stripe',
    reason: 'Stripe SDK in a Flutter app. On iOS, accepting payments outside IAP violates App Store guidelines.',
    severity: 'BLOCKER',
    fix: 'Remove Stripe from iOS build target. Use Apple IAP for all iOS digital goods/subscriptions.',
  },
  {
    name: 'purchases_flutter',
    reason: 'RevenueCat detected. Acceptable on both platforms but verify entitlement logic is correct.',
    severity: 'INFO',
    fix: 'Ensure RevenueCat is configured to use native billing on each platform.',
  },
];

// ─── Parse simple YAML key: value (no full YAML parser dependency) ───────────
function extractYamlValue(content: string, key: string): string | null {
  const re = new RegExp(`^\\s*${key}:\\s*(.+)$`, 'm');
  const m = re.exec(content);
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
}

function extractSdkConstraint(content: string): { min: string | null; max: string | null } {
  // sdk: '>=3.0.0 <4.0.0'  or  sdk: ">=3.2.0 <4.0.0"
  const sdkLine = /sdk:\s*["']([^"']+)["']/i.exec(content);
  if (!sdkLine) return { min: null, max: null };
  const constraint = sdkLine[1];
  const minM = />=?\s*([\d.]+)/.exec(constraint);
  const maxM = /<\s*([\d.]+)/.exec(constraint);
  return {
    min: minM ? minM[1] : null,
    max: maxM ? maxM[1] : null,
  };
}

function versionLessThan(a: string, b: string): boolean {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const na = pa[i] ?? 0, nb = pb[i] ?? 0;
    if (na < nb) return true;
    if (na > nb) return false;
  }
  return false;
}

// ─── Extract dependency names from pubspec.yaml ───────────────────────────────
function extractDependencies(content: string): string[] {
  // Matches lines like:  packagename: ^1.0.0  or  packagename:
  const inDepsBlock = /^dependencies:\s*\n((?:[ \t]+.+\n?)*)/m.exec(content);
  if (!inDepsBlock) return [];
  const block = inDepsBlock[1];
  const names: string[] = [];
  for (const line of block.split('\n')) {
    const m = /^\s{2,}([a-z_][a-z0-9_]*):/i.exec(line);
    if (m && m[1] !== 'sdk' && m[1] !== 'flutter') names.push(m[1]);
  }
  return names;
}

// ─── Extract { name: versionSpec } for the OSV ecosystem query ──────────────
function extractDependencyVersions(content: string): Record<string, string> {
  const inDepsBlock = /^dependencies:\s*\n((?:[ \t]+.+\n?)*)/m.exec(content);
  if (!inDepsBlock) return {};
  const block = inDepsBlock[1];
  const map: Record<string, string> = {};
  for (const line of block.split('\n')) {
    // packagename: ^1.0.0   /   packagename: 1.2.3   /   packagename: ">=1.0.0 <2.0.0"
    const m = /^\s{2,}([a-z_][a-z0-9_]*):\s*["']?([^"'\n#]+?)["']?\s*(?:#.*)?$/i.exec(line);
    if (!m) continue;
    const name = m[1];
    const spec = m[2].trim();
    if (name === 'sdk' || name === 'flutter') continue;
    // Skip "package:" with no version (then a nested block) — value would be empty.
    if (!spec || /^[a-z]+:/i.test(spec)) continue;
    map[name] = spec;
  }
  return map;
}

// ─── Main parser ──────────────────────────────────────────────────────────────
export async function parsePubspec(repoPath: string): Promise<ParserResult> {
  const findings: AuditFinding[] = [];
  const pubspecPath = path.join(repoPath, 'pubspec.yaml');

  if (!fs.existsSync(pubspecPath)) {
    return { parserName: 'PubspecParser', findings, metadata: { found: false } };
  }

  const content = fs.readFileSync(pubspecPath, 'utf-8');
  const relPath = 'pubspec.yaml';

  const appName = extractYamlValue(content, 'name');
  const version = extractYamlValue(content, 'version');
  const dartSdk = extractSdkConstraint(content);
  const flutterSdk = extractYamlValue(content, 'flutter');
  const dependencies = extractDependencies(content);
  const depVersions = extractDependencyVersions(content);

  // ── Dart SDK version check ─────────────────────────────────────────────────
  if (dartSdk.min) {
    if (versionLessThan(dartSdk.min, MIN_DART_SDK)) {
      findings.push({
        id: 'PUBSPEC_DART_SDK_LOW',
        severity: 'WARNING',
        category: 'DEPENDENCIES',
        platform: 'flutter',
        title: `Dart SDK minimum (${dartSdk.min}) is outdated`,
        description: `Dart SDK >= ${MIN_DART_SDK} is required for null-safety and current Play/App Store compatibility. Older SDKs may trigger build failures in CI pipelines.`,
        file: relPath,
        value: dartSdk.min,
        fixSuggestion: `Update sdk constraint to: sdk: '>=${MIN_DART_SDK} <4.0.0'`,
      });
    }
  } else {
    findings.push({
      id: 'PUBSPEC_NO_SDK_CONSTRAINT',
      severity: 'WARNING',
      category: 'DEPENDENCIES',
      platform: 'flutter',
      title: 'No Dart SDK version constraint declared',
      description: 'pubspec.yaml has no sdk constraint. This can cause silent breakage when built on different Dart versions.',
      file: relPath,
      fixSuggestion: `Add to pubspec.yaml:\nenvironment:\n  sdk: '>=${MIN_DART_SDK} <4.0.0'`,
    });
  }

  // ── No version field ───────────────────────────────────────────────────────
  if (!version) {
    findings.push({
      id: 'PUBSPEC_NO_VERSION',
      severity: 'WARNING',
      category: 'CONFIGURATION',
      platform: 'flutter',
      title: 'No version declared in pubspec.yaml',
      description: 'The version field is required for app store submissions. Missing it will cause build failures in Xcode and Gradle.',
      file: relPath,
      fixSuggestion: 'Add version: 1.0.0+1 to pubspec.yaml (format: semantic+buildNumber)',
    });
  }

  // ── Flagged packages ───────────────────────────────────────────────────────
  for (const pkg of FLAGGED_PACKAGES) {
    if (dependencies.includes(pkg.name)) {
      findings.push({
        id: `PUBSPEC_PKG_${pkg.name.toUpperCase()}`,
        severity: pkg.severity,
        category: pkg.severity === 'BLOCKER' ? 'COMPLIANCE' : 'DEPENDENCIES',
        platform: 'flutter',
        title: `Package detected: ${pkg.name}`,
        description: pkg.reason,
        file: relPath,
        value: pkg.name,
        fixSuggestion: pkg.fix,
      });
    }
  }

  // ── OSV.dev CVE lookup for Pub (Flutter/Dart) packages ────────────────────
  // Uses the same OSV client as PackageJsonAudit, with ecosystem='Pub'.
  let pubCveCount = 0;
  try {
    const vulns = await checkDependencies('Pub', depVersions);
    for (const v of vulns) {
      const upgradeHint = v.fixedIn ? ` Patched in ${v.name}@${v.fixedIn}.` : '';
      const replacement = v.fixedIn ? `${v.name}: ^${v.fixedIn}` : undefined;
      findings.push({
        id: `PUBSPEC_CVE_${v.name.toUpperCase()}`,
        severity: v.severity,
        category: 'DEPENDENCIES',
        platform: 'flutter',
        title: `Vulnerable Pub dependency: ${v.name}@${v.version}`,
        description:
          `${v.summary} (${v.vulnId})${v.totalVulns > 1 ? ` and ${v.totalVulns - 1} other CVE(s)` : ''}.${upgradeHint}`,
        file: relPath,
        value: v.spec,
        fixSuggestion: v.fixedIn
          ? `Upgrade ${v.name} to ${v.fixedIn} or newer: \`flutter pub upgrade ${v.name}\``
          : `Replace ${v.name} with a maintained alternative. See OSV: https://osv.dev/vulnerability/${v.vulnId}`,
        storeRule: 'Google Play / App Store — No known vulnerabilities in shipped dependencies',
        suggestedFix: replacement
          ? {
              description: `Upgrade ${v.name} from ${v.version} to ${v.fixedIn} or newer`,
              replacement,
            }
          : undefined,
      });
      pubCveCount++;
    }
  } catch {
    /* OSV failures must not break the audit */
  }

  return {
    parserName: 'PubspecParser',
    findings,
    metadata: {
      found: true,
      appName,
      version,
      dartSdkMin: dartSdk.min,
      dartSdkMax: dartSdk.max,
      dependencyCount: dependencies.length,
      dependencies,
      pubCveCount,
    },
  };
}
