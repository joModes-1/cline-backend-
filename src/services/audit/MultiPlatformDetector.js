import * as fs from 'fs';
import * as path from 'path';
const FINGERPRINTS = [
    // Flutter — highest specificity
    // NOTE: 'lib/' is the uniquely-Flutter Dart source directory.
    // 'android/' and 'ios/' exist in React Native too, so they must NOT be in the Flutter fingerprint.
    { platform: 'flutter', weight: 10, files: ['pubspec.yaml'] },
    { platform: 'flutter', weight: 8, dirs: ['lib'] },
    { platform: 'flutter', weight: 5, files: ['flutter/CMakeLists.txt'] },
    // Expo (React Native superset)
    { platform: 'expo', weight: 10, files: ['app.json', 'app.config.js', 'app.config.ts'] },
    { platform: 'expo', weight: 8, files: ['expo.json'] },
    // React Native (non-Expo)
    { platform: 'react-native', weight: 10, files: ['index.js', 'metro.config.js'] },
    { platform: 'react-native', weight: 8, dirs: ['android', 'ios'] },
    // Native Android
    { platform: 'android', weight: 10, files: ['app/src/main/AndroidManifest.xml'] },
    { platform: 'android', weight: 9, files: ['build.gradle', 'settings.gradle'] },
    { platform: 'android', weight: 7, dirs: ['app/src/main/java', 'app/src/main/kotlin'] },
    // Native iOS
    { platform: 'ios', weight: 10, files: ['Info.plist'] },
    { platform: 'ios', weight: 9, dirs: ['*.xcodeproj', '*.xcworkspace'] },
    { platform: 'ios', weight: 7, files: ['Podfile'] },
];
function fileExists(repoPath, rel) {
    try {
        return fs.existsSync(path.join(repoPath, rel));
    }
    catch {
        return false;
    }
}
function dirExists(repoPath, rel) {
    try {
        const full = path.join(repoPath, rel);
        return fs.existsSync(full) && fs.statSync(full).isDirectory();
    }
    catch {
        return false;
    }
}
// Glob-lite: check if any entry in repoPath matches pattern (single *)
function globExists(repoPath, pattern) {
    try {
        if (!pattern.includes('*'))
            return dirExists(repoPath, pattern);
        const [prefix, suffix] = pattern.split('*');
        const base = path.dirname(prefix.replace(/\/$/, '')) || repoPath;
        const entries = fs.readdirSync(path.join(repoPath, base));
        return entries.some(e => e.startsWith(path.basename(prefix)) && e.endsWith(suffix));
    }
    catch {
        return false;
    }
}
export function detectPlatform(repoPath) {
    const scores = {
        flutter: 0, expo: 0, 'react-native': 0, android: 0, ios: 0, unknown: 0,
    };
    const indicators = [];
    for (const fp of FINGERPRINTS) {
        let hit = false;
        for (const f of fp.files ?? []) {
            if (fileExists(repoPath, f)) {
                hit = true;
                indicators.push(f);
                break;
            }
        }
        for (const d of fp.dirs ?? []) {
            if (!hit && (d.includes('*') ? globExists(repoPath, d) : dirExists(repoPath, d))) {
                hit = true;
                indicators.push(d);
            }
        }
        if (hit)
            scores[fp.platform] += fp.weight;
    }
    // Resolve primary: highest score wins, with priority tie-break
    const ranked = Object.entries(scores)
        .filter(([, s]) => s > 0)
        .sort(([, a], [, b]) => b - a);
    if (ranked.length === 0) {
        return { primary: 'unknown', targets: [], confidence: 'low', indicators: [] };
    }
    const primary = ranked[0][0];
    const topScore = ranked[0][1];
    // Determine targets (multi-platform apps)
    const targets = [];
    if (primary === 'flutter' || primary === 'expo' || primary === 'react-native') {
        if (scores.android > 0)
            targets.push('android');
        if (scores.ios > 0)
            targets.push('ios');
    }
    else {
        targets.push(primary);
    }
    const confidence = topScore >= 10 ? 'high' : topScore >= 6 ? 'medium' : 'low';
    return { primary, targets, confidence, indicators: [...new Set(indicators)] };
}
//# sourceMappingURL=MultiPlatformDetector.js.map