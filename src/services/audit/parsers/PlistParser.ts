import * as fs from 'fs';
import * as path from 'path';
import type { AuditFinding, ParserResult } from '../AuditTypes';

// ─── iOS privacy usage description keys (required when using each capability) ─
const PRIVACY_KEYS: Record<string, { label: string; required: boolean }> = {
  NSCameraUsageDescription:                { label: 'Camera',                  required: true },
  NSMicrophoneUsageDescription:            { label: 'Microphone',              required: true },
  NSLocationWhenInUseUsageDescription:     { label: 'Location (When In Use)',  required: true },
  NSLocationAlwaysAndWhenInUseUsageDescription: { label: 'Location (Always)', required: true },
  NSLocationAlwaysUsageDescription:        { label: 'Location (Always, legacy)', required: false },
  NSPhotoLibraryUsageDescription:          { label: 'Photo Library',           required: true },
  NSPhotoLibraryAddUsageDescription:       { label: 'Photo Library (Add Only)', required: true },
  NSContactsUsageDescription:              { label: 'Contacts',                required: true },
  NSCalendarsUsageDescription:             { label: 'Calendars',               required: true },
  NSRemindersUsageDescription:             { label: 'Reminders',               required: true },
  NSMotionUsageDescription:                { label: 'Motion & Fitness',        required: false },
  NSBluetoothAlwaysUsageDescription:       { label: 'Bluetooth',               required: true },
  NSFaceIDUsageDescription:                { label: 'Face ID',                 required: true },
  NSSpeechRecognitionUsageDescription:     { label: 'Speech Recognition',      required: true },
  NSHealthShareUsageDescription:           { label: 'Health (Read)',            required: true },
  NSHealthUpdateUsageDescription:          { label: 'Health (Write)',           required: true },
  NSUserTrackingUsageDescription:          { label: 'App Tracking (ATT)',      required: true },
};

// ─── Find Info.plist in repo ──────────────────────────────────────────────────
function findPlist(repoPath: string): string[] {
  const candidates = [
    'ios/Info.plist',
    'Info.plist',
    'ios/Runner/Info.plist',           // Flutter default
  ];
  const found: string[] = [];
  for (const c of candidates) {
    if (fs.existsSync(path.join(repoPath, c))) found.push(c);
  }
  if (found.length === 0) {
    // Walk up to 4 levels
    const walked = walkFindAll(repoPath, 'Info.plist', 4);
    return walked.map(p => path.relative(repoPath, p));
  }
  return found;
}

function walkFindAll(dir: string, target: string, depth: number): string[] {
  if (depth === 0) return [];
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.name === target) results.push(path.join(dir, e.name));
      if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== 'build') {
        results.push(...walkFindAll(path.join(dir, e.name), target, depth - 1));
      }
    }
  } catch { /* skip unreadable dirs */ }
  return results;
}

// ─── Extract a string value for a plist key (text-based plist only) ──────────
function extractPlistValue(xml: string, key: string): string | null {
  const re = new RegExp(`<key>${key}<\\/key>\\s*<string>([^<]*)<\\/string>`, 'i');
  const m = re.exec(xml);
  return m ? m[1].trim() : null;
}

function plistHasKey(xml: string, key: string): boolean {
  return new RegExp(`<key>${key}<\\/key>`, 'i').test(xml);
}

// ─── Main parser ──────────────────────────────────────────────────────────────
export function parsePlist(repoPath: string): ParserResult {
  const findings: AuditFinding[] = [];
  const plistPaths = findPlist(repoPath);

  if (plistPaths.length === 0) {
    return { parserName: 'PlistParser', findings, metadata: { found: false } };
  }

  const presentKeys: string[] = [];
  const missingDescriptions: string[] = [];

  for (const relPath of plistPaths) {
    const xml = fs.readFileSync(path.join(repoPath, relPath), 'utf-8');

    // ── Check each privacy key ───────────────────────────────────────────────
    for (const [key, info] of Object.entries(PRIVACY_KEYS)) {
      if (plistHasKey(xml, key)) {
        presentKeys.push(key);
        const value = extractPlistValue(xml, key);

        // Empty description string
        if (value === null || value.trim() === '') {
          findings.push({
            id: `PLIST_EMPTY_DESC_${key}`,
            severity: 'BLOCKER',
            category: 'PERMISSIONS',
            platform: 'ios',
            title: `Empty usage description: ${key}`,
            description: `${key} is declared but has no description text. Apple rejects apps with empty usage strings — reviewers cannot determine why access is needed.`,
            file: relPath,
            value: key,
            fixSuggestion: `Add a clear, user-facing explanation: e.g. "We use your camera to scan QR codes for check-in."`,
            storeRule: 'App Store Review Guideline 5.1.1',
          });
        }

        // Generic/placeholder description
        if (value && /^(string|description|placeholder|test|todo|lorem|example)/i.test(value)) {
          findings.push({
            id: `PLIST_GENERIC_DESC_${key}`,
            severity: 'WARNING',
            category: 'CONTENT',
            platform: 'ios',
            title: `Generic usage description for ${info.label}`,
            description: `The usage string for ${key} appears to be a placeholder: "${value}". Apple reviewers reject vague or template descriptions.`,
            file: relPath,
            value,
            fixSuggestion: 'Replace with a specific, user-facing explanation of why the app needs this permission.',
            storeRule: 'App Store Review Guideline 5.1.1',
          });
        }
      }
    }

    // ── ATT (App Tracking Transparency) ─────────────────────────────────────
    if (!plistHasKey(xml, 'NSUserTrackingUsageDescription')) {
      // Check if any tracking-related keys suggest tracking is happening
      if (
        xml.includes('FacebookAppID') ||
        xml.includes('GADApplicationIdentifier') ||
        xml.includes('FirebaseAppDelegateProxyEnabled')
      ) {
        missingDescriptions.push('NSUserTrackingUsageDescription');
        findings.push({
          id: 'PLIST_MISSING_ATT',
          severity: 'BLOCKER',
          category: 'COMPLIANCE',
          platform: 'ios',
          title: 'Missing ATT permission string (tracking SDKs detected)',
          description: 'Facebook, Google Ads, or Firebase SDKs were detected but NSUserTrackingUsageDescription is missing. iOS 14.5+ requires ATT consent before tracking.',
          file: relPath,
          fixSuggestion: 'Add NSUserTrackingUsageDescription to Info.plist and implement ATT request in AppDelegate.',
          storeRule: 'App Store Review Guideline 5.1.2 — Data Collection',
        });
      }
    }

    // ── Privacy manifest (iOS 17+) ────────────────────────────────────────────
    const hasPrivacyManifest = fs.existsSync(path.join(repoPath, 'PrivacyInfo.xcprivacy')) ||
      fs.existsSync(path.join(repoPath, 'ios/PrivacyInfo.xcprivacy'));

    if (!hasPrivacyManifest) {
      findings.push({
        id: 'PLIST_MISSING_PRIVACY_MANIFEST',
        severity: 'BLOCKER',
        category: 'COMPLIANCE',
        platform: 'ios',
        title: 'PrivacyInfo.xcprivacy not found',
        description: 'Apple requires a PrivacyInfo.xcprivacy manifest for all apps targeting iOS 17+ (enforced from Spring 2024). Missing this file causes App Store Connect upload rejection.',
        file: relPath,
        fixSuggestion: 'Create PrivacyInfo.xcprivacy in your iOS project root and declare all accessed API categories and data use.',
        storeRule: 'App Store — Privacy Manifest Policy (2024)',
      });
    }
  }

  return {
    parserName: 'PlistParser',
    findings,
    metadata: {
      found: true,
      plistFiles: plistPaths,
      privacyKeysFound: presentKeys,
      missingRequired: missingDescriptions,
    },
  };
}
