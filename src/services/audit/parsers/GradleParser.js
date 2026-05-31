import * as fs from 'fs';
import * as path from 'path';
// ─── Google Play SDK requirements (as of 2024) ────────────────────────────────
const PLAY_MIN_TARGET_SDK = 34; // hard reject below this
const PLAY_WARN_TARGET_SDK = 33; // warning zone
const ABSOLUTE_MIN_SDK_WARN = 21; // warn if minSdk is very old
// ─── Known vulnerable / deprecated dependency patterns ────────────────────────
const FLAGGED_DEPENDENCIES = [
    {
        pattern: /com\.google\.android\.gms:play-services-ads:\d+\.\d+/,
        title: 'Google Ads SDK detected (check IAP policy)',
        fix: 'If used in an iOS companion app, ensure no external payment flows bypass Apple IAP.',
        severity: 'WARNING',
    },
    {
        pattern: /io\.fabric|com\.crashlytics/,
        title: 'Deprecated Fabric/Crashlytics SDK',
        fix: 'Migrate to Firebase Crashlytics: com.google.firebase:firebase-crashlytics',
        severity: 'WARNING',
    },
    {
        pattern: /com\.android\.support:/,
        title: 'Deprecated Android Support Library',
        fix: 'Migrate to AndroidX: replace com.android.support with androidx.* equivalents.',
        severity: 'WARNING',
    },
    {
        pattern: /okhttp:2\./,
        title: 'Outdated OkHttp 2.x (security risk)',
        fix: 'Upgrade to OkHttp 4.x: implementation("com.squareup.okhttp3:okhttp:4.x.x")',
        severity: 'WARNING',
    },
];
// ─── Find build.gradle files ──────────────────────────────────────────────────
function findGradleFiles(repoPath) {
    const candidates = [
        'app/build.gradle',
        'app/build.gradle.kts',
        'android/app/build.gradle',
        'android/app/build.gradle.kts',
        'build.gradle',
        'build.gradle.kts',
    ];
    return candidates.filter(c => fs.existsSync(path.join(repoPath, c)));
}
// ─── Extract integer value from Gradle DSL ────────────────────────────────────
function extractGradleInt(content, key) {
    // Matches: targetSdkVersion 34 / targetSdk = 34 / targetSdkVersion(34)
    const patterns = [
        new RegExp(`${key}\\s*=\\s*(\\d+)`),
        new RegExp(`${key}\\s+(\\d+)`),
        new RegExp(`${key}\\((\\d+)\\)`),
        new RegExp(`${key}\\s*=\\s*libs\\.versions\\..*?/`), // version catalog (skip)
    ];
    for (const p of patterns) {
        const m = p.exec(content);
        if (m && m[1])
            return parseInt(m[1], 10);
    }
    return null;
}
function extractGradleString(content, key) {
    const m = new RegExp(`${key}\\s*=?\\s*["']([^"']+)["']`).exec(content);
    return m ? m[1] : null;
}
// ─── Main parser ──────────────────────────────────────────────────────────────
export function parseGradle(repoPath) {
    const findings = [];
    const gradleFiles = findGradleFiles(repoPath);
    if (gradleFiles.length === 0) {
        return { parserName: 'GradleParser', findings, metadata: { found: false } };
    }
    let targetSdk = null;
    let minSdk = null;
    let compileSdk = null;
    let versionName = null;
    let foundIn = null;
    const allDependencies = [];
    for (const relPath of gradleFiles) {
        const content = fs.readFileSync(path.join(repoPath, relPath), 'utf-8');
        // Prefer app-level gradle (has android block with sdk versions)
        if (content.includes('android {') || content.includes('android{')) {
            targetSdk = targetSdk ?? extractGradleInt(content, 'targetSdkVersion') ?? extractGradleInt(content, 'targetSdk');
            minSdk = minSdk ?? extractGradleInt(content, 'minSdkVersion') ?? extractGradleInt(content, 'minSdk');
            compileSdk = compileSdk ?? extractGradleInt(content, 'compileSdkVersion') ?? extractGradleInt(content, 'compileSdk');
            versionName = versionName ?? extractGradleString(content, 'versionName');
            foundIn = relPath;
        }
        // Collect all dependency lines
        const depBlock = content.match(/dependencies\s*\{([^}]+)\}/s);
        if (depBlock) {
            const lines = depBlock[1].split('\n').map(l => l.trim()).filter(Boolean);
            allDependencies.push(...lines);
        }
    }
    // ── SDK version checks ────────────────────────────────────────────────────
    if (targetSdk !== null) {
        if (targetSdk < PLAY_MIN_TARGET_SDK) {
            findings.push({
                id: 'GRADLE_TARGET_SDK_LOW',
                severity: 'BLOCKER',
                category: 'DEPENDENCIES',
                platform: 'android',
                title: `targetSdkVersion ${targetSdk} is below Google Play minimum (${PLAY_MIN_TARGET_SDK})`,
                description: `Google Play requires targetSdkVersion >= ${PLAY_MIN_TARGET_SDK} (Android 14) for new submissions and updates. Apps below this are rejected automatically.`,
                file: foundIn ?? gradleFiles[0],
                value: String(targetSdk),
                fixSuggestion: `Update targetSdkVersion to ${PLAY_MIN_TARGET_SDK} in your app/build.gradle and test for API 34 compatibility.`,
                storeRule: 'Google Play — Target API Level Requirements (2024)',
            });
        }
        else if (targetSdk < PLAY_MIN_TARGET_SDK + 1) {
            findings.push({
                id: 'GRADLE_TARGET_SDK_WARN',
                severity: 'WARNING',
                category: 'DEPENDENCIES',
                platform: 'android',
                title: `targetSdkVersion ${targetSdk} meets minimum but will be outdated soon`,
                description: `Google Play raises the minimum targetSdkVersion each year. Plan to update to the latest SDK.`,
                file: foundIn ?? gradleFiles[0],
                value: String(targetSdk),
                fixSuggestion: 'Monitor Google Play target API timeline and stay 1 SDK ahead of the minimum.',
            });
        }
    }
    else {
        findings.push({
            id: 'GRADLE_NO_TARGET_SDK',
            severity: 'WARNING',
            category: 'DEPENDENCIES',
            platform: 'android',
            title: 'Could not determine targetSdkVersion',
            description: 'targetSdkVersion was not found in any Gradle file. This may indicate a version catalog or dynamic config that requires manual review.',
            file: gradleFiles[0],
            fixSuggestion: 'Ensure targetSdkVersion is explicitly declared in app/build.gradle.',
        });
    }
    if (minSdk !== null && minSdk < ABSOLUTE_MIN_SDK_WARN) {
        findings.push({
            id: 'GRADLE_MIN_SDK_OLD',
            severity: 'INFO',
            category: 'DEPENDENCIES',
            platform: 'android',
            title: `minSdkVersion ${minSdk} supports very old Android versions`,
            description: `Supporting Android below API ${ABSOLUTE_MIN_SDK_WARN} (Android 5.0) increases attack surface and limits available security APIs.`,
            file: foundIn ?? gradleFiles[0],
            value: String(minSdk),
            fixSuggestion: `Consider raising minSdkVersion to at least ${ABSOLUTE_MIN_SDK_WARN} unless your target market requires older devices.`,
        });
    }
    // ── Dependency audit ──────────────────────────────────────────────────────
    const depsJoined = allDependencies.join('\n');
    for (const dep of FLAGGED_DEPENDENCIES) {
        if (dep.pattern.test(depsJoined)) {
            findings.push({
                id: `GRADLE_DEP_${dep.pattern.source.slice(0, 30).replace(/\W/g, '_').toUpperCase()}`,
                severity: dep.severity,
                category: 'DEPENDENCIES',
                platform: 'android',
                title: dep.title,
                description: `Detected in Gradle dependency block.`,
                file: foundIn ?? gradleFiles[0],
                fixSuggestion: dep.fix,
            });
        }
    }
    return {
        parserName: 'GradleParser',
        findings,
        metadata: {
            found: true,
            gradleFiles,
            targetSdkVersion: targetSdk,
            minSdkVersion: minSdk,
            compileSdkVersion: compileSdk,
            versionName,
            dependencyCount: allDependencies.length,
        },
    };
}
//# sourceMappingURL=GradleParser.js.map