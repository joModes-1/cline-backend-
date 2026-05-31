import * as fs from 'fs';
import * as path from 'path';
import type { AuditFinding, ParserResult } from '../AuditTypes';

// ─── Dangerous permissions that require justification ────────────────────────
const BACKGROUND_PERMISSIONS = [
  'android.permission.ACCESS_BACKGROUND_LOCATION',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.RECEIVE_BOOT_COMPLETED',
  'android.permission.REQUEST_INSTALL_PACKAGES',
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.WRITE_SETTINGS',
  'android.permission.MANAGE_EXTERNAL_STORAGE',
];

const DANGEROUS_PERMISSIONS = [
  'android.permission.READ_CONTACTS',
  'android.permission.WRITE_CONTACTS',
  'android.permission.READ_CALL_LOG',
  'android.permission.PROCESS_OUTGOING_CALLS',
  'android.permission.RECORD_AUDIO',
  'android.permission.CAMERA',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.READ_SMS',
  'android.permission.SEND_SMS',
  'android.permission.READ_PHONE_STATE',
];

// ─── Find AndroidManifest.xml in repo ────────────────────────────────────────
function findManifest(repoPath: string): string | null {
  const candidates = [
    'app/src/main/AndroidManifest.xml',
    'android/app/src/main/AndroidManifest.xml',
    'AndroidManifest.xml',
  ];
  for (const c of candidates) {
    const full = path.join(repoPath, c);
    if (fs.existsSync(full)) return full;
  }
  // Walk up to 3 levels for non-standard structures
  try {
    const found = walkFind(repoPath, 'AndroidManifest.xml', 3);
    return found ?? null;
  } catch {
    return null;
  }
}

function walkFind(dir: string, target: string, depth: number): string | undefined {
  if (depth === 0) return undefined;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name === target) return path.join(dir, e.name);
    if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') {
      const result = walkFind(path.join(dir, e.name), target, depth - 1);
      if (result) return result;
    }
  }
  return undefined;
}

// ─── Lightweight XML attribute extractor (no external deps) ──────────────────
function extractAttributes(xml: string, tag: string, attr: string): string[] {
  const results: string[] = [];
  const tagRe = new RegExp(`<${tag}[^>]*>`, 'gi');
  const attrRe = new RegExp(`${attr}="([^"]+)"`, 'i');
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(xml)) !== null) {
    const attrMatch = attrRe.exec(match[0]);
    if (attrMatch) results.push(attrMatch[1]);
  }
  return results;
}

function hasAttribute(xml: string, tag: string, attr: string, value: string): boolean {
  const re = new RegExp(`<${tag}[^>]*${attr}="${value}"[^>]*>`, 'i');
  return re.test(xml);
}

function extractTagAttribute(xml: string, attr: string): string[] {
  const re = new RegExp(`${attr}="([^"]+)"`, 'gi');
  const results: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) results.push(m[1]);
  return [...new Set(results)];
}

// ─── Main parser ──────────────────────────────────────────────────────────────
export function parseManifest(repoPath: string): ParserResult {
  const findings: AuditFinding[] = [];
  const manifestPath = findManifest(repoPath);

  if (!manifestPath) {
    return { parserName: 'ManifestParser', findings, metadata: { found: false } };
  }

  const relPath = path.relative(repoPath, manifestPath);
  const xml = fs.readFileSync(manifestPath, 'utf-8');

  // ── Extract all declared permissions ──────────────────────────────────────
  const permissions = extractAttributes(xml, 'uses-permission', 'android:name');
  const permissionsNonAlt = extractAttributes(xml, 'uses-permission-sdk-23', 'android:name');
  const allPermissions = [...permissions, ...permissionsNonAlt];

  // ── Background / high-risk permissions ────────────────────────────────────
  for (const perm of allPermissions) {
    if (BACKGROUND_PERMISSIONS.includes(perm)) {
      findings.push({
        id: `MANIFEST_BG_PERM_${perm.split('.').pop()}`,
        severity: 'BLOCKER',
        category: 'PERMISSIONS',
        platform: 'android',
        title: `Background permission declared: ${perm.split('.').pop()}`,
        description: `${perm} is flagged by Google Play automated review. It requires policy-grade justification and a Privacy Policy that explicitly covers this use.`,
        file: relPath,
        value: perm,
        fixSuggestion: 'Remove this permission if not actively used, or submit a Permissions Declaration Form in the Play Console.',
        storeRule: 'Google Play Policy — Permissions (Section 4.1)',
      });
    } else if (DANGEROUS_PERMISSIONS.includes(perm)) {
      findings.push({
        id: `MANIFEST_DANGEROUS_PERM_${perm.split('.').pop()}`,
        severity: 'WARNING',
        category: 'PERMISSIONS',
        platform: 'android',
        title: `Sensitive permission declared: ${perm.split('.').pop()}`,
        description: `${perm} requires runtime consent. Ensure it is actually used and covered by your Privacy Policy.`,
        file: relPath,
        value: perm,
        fixSuggestion: 'Confirm this permission is actively used in the app. Remove if not needed.',
      });
    }
  }

  // ── debuggable flag ────────────────────────────────────────────────────────
  if (hasAttribute(xml, 'application', 'android:debuggable', 'true')) {
    findings.push({
      id: 'MANIFEST_DEBUGGABLE',
      severity: 'BLOCKER',
      category: 'SECURITY',
      platform: 'android',
      title: 'android:debuggable="true" in production manifest',
      description: 'The application is set to debuggable. Google Play rejects apps with this flag enabled in release builds.',
      file: relPath,
      fixSuggestion: 'Remove android:debuggable="true" or set it to false. Let the build system control this via buildType.',
      storeRule: 'Google Play — Security Policy',
    });
  }

  // ── cleartext traffic ──────────────────────────────────────────────────────
  if (hasAttribute(xml, 'application', 'android:usesCleartextTraffic', 'true')) {
    findings.push({
      id: 'MANIFEST_CLEARTEXT',
      severity: 'WARNING',
      category: 'SECURITY',
      platform: 'android',
      title: 'Cleartext (HTTP) traffic is enabled',
      description: 'android:usesCleartextTraffic="true" allows unencrypted HTTP connections. Flagged by Play Store security scanners.',
      file: relPath,
      fixSuggestion: 'Switch all endpoints to HTTPS. If needed for dev only, use a network_security_config.xml scoped to debug builds.',
    });
  }

  // ── allowBackup ────────────────────────────────────────────────────────────
  if (hasAttribute(xml, 'application', 'android:allowBackup', 'true')) {
    findings.push({
      id: 'MANIFEST_ALLOW_BACKUP',
      severity: 'INFO',
      category: 'SECURITY',
      platform: 'android',
      title: 'android:allowBackup is enabled',
      description: 'App data can be backed up and restored by Android. This can expose sensitive local data (tokens, private keys).',
      file: relPath,
      fixSuggestion: 'Set android:allowBackup="false" unless you explicitly support backup/restore and exclude sensitive files.',
    });
  }

  // ── exported activities without intent protection ──────────────────────────
  const exportedActivities = extractAttributes(xml, 'activity', 'android:exported');
  const trueExported = exportedActivities.filter(v => v === 'true').length;
  if (trueExported > 2) {
    findings.push({
      id: 'MANIFEST_EXPORTED_ACTIVITIES',
      severity: 'WARNING',
      category: 'SECURITY',
      platform: 'android',
      title: `${trueExported} activities marked android:exported="true"`,
      description: 'Exported activities are accessible by other apps. Each exported activity is an attack surface unless protected by permissions.',
      file: relPath,
      fixSuggestion: 'Audit each exported activity. Set android:exported="false" for activities not intended for external access.',
    });
  }

  const metadata = {
    found: true,
    manifestPath: relPath,
    permissions: allPermissions,
    permissionCount: allPermissions.length,
    packageName: extractTagAttribute(xml, 'package')[0] ?? null,
  };

  return { parserName: 'ManifestParser', findings, metadata };
}
