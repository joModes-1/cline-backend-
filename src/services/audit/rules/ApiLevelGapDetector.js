import * as fs from 'fs';
import * as path from 'path';
// ─── Store SDK requirements (updated annually) ────────────────────────────────
const REQUIREMENTS = {
    android: {
        minTarget: 34, // Google Play hard reject below this (2024)
        warnTarget: 34, // warn if exactly at minimum (next year's deadline)
        minCompile: 34, // compileSdk should match or exceed targetSdk
        minSdkWarn: 21, // warn if minSdk supports very old Android
        minSdkDrop: 16, // below this is an extremely wide attack surface
    },
    ios: {
        minDeployment: 16, // Apple drops support for iOS below 16 in 2025
        warnDeployment: 15, // warn approaching drop
    },
};
// ─── File finders ─────────────────────────────────────────────────────────────
function findGradleFiles(repoPath) {
    const candidates = [
        'app/build.gradle', 'app/build.gradle.kts',
        'android/app/build.gradle', 'android/app/build.gradle.kts',
        'build.gradle', 'build.gradle.kts',
    ];
    return candidates.filter(c => fs.existsSync(path.join(repoPath, c)));
}
function findPodfile(repoPath) {
    const candidates = ['ios/Podfile', 'Podfile'];
    for (const c of candidates) {
        if (fs.existsSync(path.join(repoPath, c)))
            return c;
    }
    return null;
}
function findXcodeProj(repoPath) {
    const candidates = ['ios'];
    for (const c of candidates) {
        const dir = path.join(repoPath, c);
        if (!fs.existsSync(dir))
            continue;
        const entries = fs.readdirSync(dir);
        const proj = entries.find(e => e.endsWith('.xcodeproj'));
        if (proj)
            return path.join(c, proj);
    }
    return null;
}
// ─── Gradle value extractors ──────────────────────────────────────────────────
function extractInt(content, key) {
    const patterns = [
        new RegExp(`${key}\\s*=\\s*(\\d+)`),
        new RegExp(`${key}\\s+(\\d+)`),
        new RegExp(`${key}\\((\\d+)\\)`),
    ];
    for (const p of patterns) {
        const m = p.exec(content);
        if (m?.[1])
            return parseInt(m[1], 10);
    }
    return null;
}
// ─── iOS deployment target extractor (from Podfile or pbxproj) ───────────────
function extractIosDeployment(repoPath) {
    const podfile = findPodfile(repoPath);
    if (podfile) {
        const content = fs.readFileSync(path.join(repoPath, podfile), 'utf-8');
        const m = /platform\s+:ios\s*,\s*['"]?(\d+)/i.exec(content);
        if (m)
            return parseInt(m[1], 10);
    }
    // Try pbxproj
    try {
        const xcodeProj = findXcodeProj(repoPath);
        if (xcodeProj) {
            const pbxPath = path.join(repoPath, xcodeProj, 'project.pbxproj');
            if (fs.existsSync(pbxPath)) {
                const content = fs.readFileSync(pbxPath, 'utf-8');
                const m = /IPHONEOS_DEPLOYMENT_TARGET\s*=\s*(\d+)/i.exec(content);
                if (m)
                    return parseInt(m[1], 10);
            }
        }
    }
    catch { /* skip */ }
    return null;
}
// ─── Main checker ─────────────────────────────────────────────────────────────
export function detectApiLevelGaps(repoPath) {
    const findings = [];
    const gradleFiles = findGradleFiles(repoPath);
    // ── Android SDK checks ────────────────────────────────────────────────────
    let targetSdk = null;
    let minSdk = null;
    let compileSdk = null;
    let gradleFile = null;
    for (const relPath of gradleFiles) {
        const content = fs.readFileSync(path.join(repoPath, relPath), 'utf-8');
        if (!content.includes('android {') && !content.includes('android{'))
            continue;
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
                    description: `Google Play requires all app updates to target Android ${REQUIREMENTS.android.minTarget} (API ${REQUIREMENTS.android.minTarget}) or higher. ` +
                        `Apps with targetSdkVersion ${targetSdk} are automatically rejected at upload. This is a hard gate — no exceptions.`,
                    file: gradleFile,
                    value: String(targetSdk),
                    fixSuggestion: `Set targetSdkVersion ${REQUIREMENTS.android.minTarget} in ${gradleFile}. ` +
                        `Then test on Android ${REQUIREMENTS.android.minTarget} — check for behavior changes in permissions, notifications, and background tasks.`,
                    storeRule: 'Google Play Target API Level Requirements — 2024',
                });
            }
        }
        else {
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
                description: `compileSdkVersion must be >= targetSdkVersion. A lower compileSdk means your app is compiled against an older API ` +
                    `but claims to support a newer one — this causes runtime crashes and Gradle build warnings.`,
                file: gradleFile,
                value: `compileSdk=${compileSdk}, targetSdk=${targetSdk}`,
                fixSuggestion: `Set compileSdkVersion ${targetSdk} (or higher) to match targetSdkVersion.`,
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
                    description: `Supporting Android API ${minSdk} means the app runs on devices from 2012-2014. ` +
                        `These devices cannot use modern TLS, biometrics, or security APIs. Google Play may flag this in security reviews.`,
                    file: gradleFile,
                    value: String(minSdk),
                    fixSuggestion: `Raise minSdkVersion to at least ${REQUIREMENTS.android.minSdkWarn} (Android 5.0). Most production apps use 21+.`,
                });
            }
            else if (minSdk < REQUIREMENTS.android.minSdkWarn) {
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
                description: `Apple will drop support for iOS ${iosDeployment} in upcoming Xcode versions. ` +
                    `Apps targeting iOS < ${REQUIREMENTS.ios.minDeployment} cannot use SwiftUI, StoreKit 2, App Tracking Transparency, or PrivacyInfo manifests.`,
                file: podfile ?? 'ios/Podfile',
                value: String(iosDeployment),
                fixSuggestion: `Set platform :ios, '${REQUIREMENTS.ios.minDeployment}.0' in your Podfile and update IPHONEOS_DEPLOYMENT_TARGET in Xcode.`,
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
//# sourceMappingURL=ApiLevelGapDetector.js.map