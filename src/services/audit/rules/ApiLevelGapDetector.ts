import * as fs from 'fs';
import * as path from 'path';
import type { AuditFinding, ParserResult } from '../AuditTypes';
import {
  ANDROID_MIN_TARGET_SDK,
  ANDROID_MIN_COMPILE_SDK,
  ANDROID_MIN_SDK_WARN,
  ANDROID_MIN_SDK_DROP,
  IOS_MIN_DEPLOYMENT,
} from '../policy-thresholds';

// ─── Store SDK requirements — sourced from policy-thresholds.ts ─────────────
// Single bump in policy-thresholds.ts fans out to every audit rule.
const REQUIREMENTS = {
  android: {
    minTarget: ANDROID_MIN_TARGET_SDK,
    warnTarget: ANDROID_MIN_TARGET_SDK,
    minCompile: ANDROID_MIN_COMPILE_SDK,
    minSdkWarn: ANDROID_MIN_SDK_WARN,
    minSdkDrop: ANDROID_MIN_SDK_DROP,
  },
  ios: {
    minDeployment: IOS_MIN_DEPLOYMENT,
    warnDeployment: IOS_MIN_DEPLOYMENT - 1,
  },
};

// ─── File finders ─────────────────────────────────────────────────────────────
function findGradleFiles(repoPath: string): string[] {
  const candidates = [
    'app/build.gradle', 'app/build.gradle.kts',
    'android/app/build.gradle', 'android/app/build.gradle.kts',
    'build.gradle', 'build.gradle.kts',
  ];
  return candidates.filter(c => fs.existsSync(path.join(repoPath, c)));
}

function findPodfile(repoPath: string): string | null {
  const candidates = ['ios/Podfile', 'Podfile'];
  for (const c of candidates) {
    if (fs.existsSync(path.join(repoPath, c))) return c;
  }
  return null;
}

function findXcodeProj(repoPath: string): string | null {
  const candidates = ['ios'];
  for (const c of candidates) {
    const dir = path.join(repoPath, c);
    if (!fs.existsSync(dir)) continue;
    const entries = fs.readdirSync(dir);
    const proj = entries.find(e => e.endsWith('.xcodeproj'));
    if (proj) return path.join(c, proj);
  }
  return null;
}

// ─── Gradle value extractors ──────────────────────────────────────────────────
function extractInt(content: string, key: string): number | null {
  const patterns = [
    new RegExp(`${key}\\s*=\\s*(\\d+)`),
    new RegExp(`${key}\\s+(\\d+)`),
    new RegExp(`${key}\\((\\d+)\\)`),
  ];
  for (const p of patterns) {
    const m = p.exec(content);
    if (m?.[1]) return parseInt(m[1], 10);
  }
  return null;
}

// ─── iOS deployment target extractor (from Podfile or pbxproj) ───────────────
function extractIosDeployment(repoPath: string): number | null {
  const podfile = findPodfile(repoPath);
  if (podfile) {
    const content = fs.readFileSync(path.join(repoPath, podfile), 'utf-8');
    const m = /platform\s+:ios\s*,\s*['"]?(\d+)/i.exec(content);
    if (m) return parseInt(m[1], 10);
  }
  // Try pbxproj
  try {
    const xcodeProj = findXcodeProj(repoPath);
    if (xcodeProj) {
      const pbxPath = path.join(repoPath, xcodeProj, 'project.pbxproj');
      if (fs.existsSync(pbxPath)) {
        const content = fs.readFileSync(pbxPath, 'utf-8');
        const m = /IPHONEOS_DEPLOYMENT_TARGET\s*=\s*(\d+)/i.exec(content);
        if (m) return parseInt(m[1], 10);
      }
    }
  } catch { /* skip */ }
  return null;
}

// ─── Main checker ─────────────────────────────────────────────────────────────
export function detectApiLevelGaps(repoPath: string): ParserResult {
  const findings: AuditFinding[] = [];
  const gradleFiles = findGradleFiles(repoPath);

  // ── Android SDK checks ────────────────────────────────────────────────────
  let targetSdk: number | null = null;
  let minSdk: number | null = null;
  let compileSdk: number | null = null;
  let gradleFile: string | null = null;

  for (const relPath of gradleFiles) {
    const content = fs.readFileSync(path.join(repoPath, relPath), 'utf-8');
    if (!content.includes('android {') && !content.includes('android{')) continue;
    targetSdk ??= extractInt(content, 'targetSdkVersion') ?? extractInt(content, 'targetSdk');
    minSdk ??= extractInt(content, 'minSdkVersion') ?? extractInt(content, 'minSdk');
    compileSdk ??= extractInt(content, 'compileSdkVersion') ?? extractInt(content, 'compileSdk');
    gradleFile = relPath;
    break;
  }

  if (gradleFile) {
    // targetSdk gap
    if (targetSdk !== null) {
      if (targetSdk < REQUIREMENTS.android.minTarget) {
        findings.push({
          id: 'API_ANDROID_TARGET_SDK_BELOW_MINIMUM',
          severity: 'BLOCKER',
          category: 'COMPLIANCE',
          platform: 'android',
          title: `Android targetSdkVersion ${targetSdk} below Play Store minimum (${REQUIREMENTS.android.minTarget})`,
          description:
            `Google Play requires all app updates to target Android ${REQUIREMENTS.android.minTarget} (API ${REQUIREMENTS.android.minTarget}) or higher. ` +
            `Apps with targetSdkVersion ${targetSdk} are automatically rejected at upload. This is a hard gate — no exceptions.`,
          file: gradleFile,
          value: String(targetSdk),
          fixSuggestion:
            `Set targetSdkVersion ${REQUIREMENTS.android.minTarget} in ${gradleFile}. ` +
            `Then test on Android ${REQUIREMENTS.android.minTarget} — check for behavior changes in permissions, notifications, and background tasks.`,
          storeRule: 'Google Play Target API Level Requirements — 2024',
          suggestedFix: {
            description: `Bump targetSdkVersion to ${REQUIREMENTS.android.minTarget}`,
            replacement: `targetSdkVersion ${REQUIREMENTS.android.minTarget}`,
          },
        });
      }
    } else {
      findings.push({
        id: 'API_ANDROID_TARGET_SDK_MISSING',
        severity: 'WARNING',
        category: 'COMPLIANCE',
        platform: 'android',
        title: 'Android targetSdkVersion not found in Gradle files',
        description: 'targetSdkVersion could not be extracted. It may be set via a version catalog or dynamic property. Manual verification required.',
        file: gradleFile,
        fixSuggestion: 'Explicitly declare targetSdkVersion in app/build.gradle for reliable store submission.',
      });
    }

    // compileSdk vs targetSdk mismatch
    if (compileSdk !== null && targetSdk !== null && compileSdk < targetSdk) {
      findings.push({
        id: 'API_ANDROID_COMPILE_SDK_MISMATCH',
        severity: 'WARNING',
        category: 'COMPLIANCE',
        platform: 'android',
        title: `compileSdkVersion (${compileSdk}) is lower than targetSdkVersion (${targetSdk})`,
        description:
          `compileSdkVersion must be >= targetSdkVersion. A lower compileSdk means your app is compiled against an older API ` +
          `but claims to support a newer one — this causes runtime crashes and Gradle build warnings.`,
        file: gradleFile,
        value: `compileSdk=${compileSdk}, targetSdk=${targetSdk}`,
        fixSuggestion: `Set compileSdkVersion ${targetSdk} (or higher) to match targetSdkVersion.`,
        suggestedFix: {
          description: `Bump compileSdkVersion to match targetSdkVersion (${targetSdk})`,
          replacement: `compileSdkVersion ${targetSdk}`,
        },
      });
    }

    // minSdk too low
    if (minSdk !== null) {
      if (minSdk < REQUIREMENTS.android.minSdkDrop) {
        findings.push({
          id: 'API_ANDROID_MIN_SDK_CRITICAL',
          severity: 'WARNING',
          category: 'COMPLIANCE',
          platform: 'android',
          title: `minSdkVersion ${minSdk} is critically low (Android ${minSdk})`,
          description:
            `Supporting Android API ${minSdk} means the app runs on devices from 2012-2014. ` +
            `These devices cannot use modern TLS, biometrics, or security APIs. Google Play may flag this in security reviews.`,
          file: gradleFile,
          value: String(minSdk),
          fixSuggestion: `Raise minSdkVersion to at least ${REQUIREMENTS.android.minSdkWarn} (Android 5.0). Most production apps use 21+.`,
        });
      } else if (minSdk < REQUIREMENTS.android.minSdkWarn) {
        findings.push({
          id: 'API_ANDROID_MIN_SDK_OLD',
          severity: 'INFO',
          category: 'COMPLIANCE',
          platform: 'android',
          title: `minSdkVersion ${minSdk} supports outdated Android versions`,
          description: `Android below API ${REQUIREMENTS.android.minSdkWarn} (5.0) has <1% market share and limits available security APIs.`,
          file: gradleFile,
          value: String(minSdk),
          fixSuggestion: `Consider raising minSdkVersion to ${REQUIREMENTS.android.minSdkWarn} unless your market requires older devices.`,
        });
      }
    }
  }

  // ── iOS deployment target check ───────────────────────────────────────────
  const iosDeployment = extractIosDeployment(repoPath);
  const podfile = findPodfile(repoPath);

  if (iosDeployment !== null) {
    if (iosDeployment < REQUIREMENTS.ios.minDeployment) {
      findings.push({
        id: 'API_IOS_DEPLOYMENT_TARGET_LOW',
        severity: 'WARNING',
        category: 'COMPLIANCE',
        platform: 'ios',
        title: `iOS deployment target (${iosDeployment}) is below recommended minimum (${REQUIREMENTS.ios.minDeployment})`,
        description:
          `Apple will drop support for iOS ${iosDeployment} in upcoming Xcode versions. ` +
          `Apps targeting iOS < ${REQUIREMENTS.ios.minDeployment} cannot use SwiftUI, StoreKit 2, App Tracking Transparency, or PrivacyInfo manifests.`,
        file: podfile ?? 'ios/Podfile',
        value: String(iosDeployment),
        fixSuggestion: `Set platform :ios, '${REQUIREMENTS.ios.minDeployment}.0' in your Podfile and update IPHONEOS_DEPLOYMENT_TARGET in Xcode.`,
        suggestedFix: {
          description: `Raise iOS deployment target to ${REQUIREMENTS.ios.minDeployment}.0`,
          replacement: `platform :ios, '${REQUIREMENTS.ios.minDeployment}.0'`,
        },
      });
    }
  }

  return {
    parserName: 'ApiLevelGapDetector',
    findings,
    metadata: {
      android: { targetSdk, minSdk, compileSdk, gradleFile },
      ios: { deploymentTarget: iosDeployment },
    },
  };
}
