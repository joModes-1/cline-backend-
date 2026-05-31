import * as fs from 'fs';
import * as path from 'path';
const FLAGGED_PACKAGES = [
    // IAP / payment violations
    {
        name: 'stripe',
        reason: 'Stripe SDK in a React Native/Expo app. Accepting payments outside Apple IAP violates App Store guidelines for digital goods.',
        severity: 'BLOCKER',
        platforms: ['ios'],
        fix: 'Use react-native-iap or expo-in-app-purchases for iOS digital purchases. Stripe is only allowed for physical goods.',
        storeRule: 'App Store Review Guideline 3.1.1',
    },
    {
        name: '@stripe/stripe-react-native',
        reason: 'Stripe React Native SDK detected. On iOS, digital goods must use Apple IAP.',
        severity: 'BLOCKER',
        platforms: ['ios'],
        fix: 'Gate Stripe to Android only. Use react-native-iap for iOS subscriptions and digital goods.',
        storeRule: 'App Store Review Guideline 3.1.1',
    },
    {
        name: 'react-native-iap',
        reason: 'In-App Purchase package detected. Ensure it is correctly integrated for both iOS and Android.',
        severity: 'INFO',
        platforms: ['both'],
        fix: 'Verify IAP flows complete on both platforms. Test receipt validation server-side.',
    },
    // Tracking
    {
        name: '@react-native-firebase/analytics',
        reason: 'Firebase Analytics with tracking enabled. Ensure ATT consent is implemented on iOS 14.5+.',
        severity: 'WARNING',
        platforms: ['ios'],
        fix: 'Add NSUserTrackingUsageDescription to Info.plist and request ATT permission before initializing analytics.',
        storeRule: 'App Store Review Guideline 5.1.2',
    },
    {
        name: 'react-native-facebook-sdk',
        reason: 'Facebook SDK detected. Requires ATT consent and App Tracking Transparency implementation.',
        severity: 'WARNING',
        platforms: ['ios'],
        fix: 'Implement ATT permission request and update FacebookAutoLogAppEventsEnabled in Info.plist.',
    },
    // Deprecated / security risk
    {
        name: 'react-native-camera',
        reason: 'Deprecated package. Replaced by react-native-vision-camera.',
        severity: 'WARNING',
        platforms: ['both'],
        fix: 'Migrate to react-native-vision-camera which is actively maintained.',
    },
    {
        name: 'rn-fetch-blob',
        reason: 'rn-fetch-blob is unmaintained. Can cause store review issues on newer iOS/Android.',
        severity: 'WARNING',
        platforms: ['both'],
        fix: 'Replace with react-native-blob-util or react-native-fs.',
    },
    {
        name: 'react-native-linear-gradient',
        reason: 'Known version range issues with New Architecture. Check for peer dependency warnings.',
        severity: 'INFO',
        platforms: ['both'],
        fix: 'Ensure you are using a version compatible with React Native New Architecture if targeting RN 0.73+.',
    },
];
// ─── Node.js version check ────────────────────────────────────────────────────
const MIN_NODE_MAJOR = 18;
// ─── Find package.json (app root, not monorepo nested) ───────────────────────
function findPackageJson(repoPath) {
    const candidates = ['package.json', 'app/package.json', 'mobile/package.json'];
    for (const c of candidates) {
        if (fs.existsSync(path.join(repoPath, c)))
            return c;
    }
    return null;
}
function parseVersion(v) {
    return parseInt(v.replace(/[^0-9]/, ''), 10) || 0;
}
// ─── Main parser ──────────────────────────────────────────────────────────────
export function auditPackageJson(repoPath) {
    const findings = [];
    const relPath = findPackageJson(repoPath);
    if (!relPath) {
        return { parserName: 'PackageJsonAudit', findings, metadata: { found: false } };
    }
    let pkg;
    try {
        pkg = JSON.parse(fs.readFileSync(path.join(repoPath, relPath), 'utf-8'));
    }
    catch {
        findings.push({
            id: 'PKG_PARSE_ERROR',
            severity: 'BLOCKER',
            category: 'CONFIGURATION',
            platform: 'both',
            title: 'package.json is invalid JSON',
            description: 'The package.json file could not be parsed. This will prevent npm install and all build pipelines from running.',
            file: relPath,
            fixSuggestion: 'Run `npx fixjson package.json` or validate at jsonlint.com.',
        });
        return { parserName: 'PackageJsonAudit', findings, metadata: { found: true, parseError: true } };
    }
    const allDeps = {
        ...(pkg.dependencies ?? {}),
        ...(pkg.devDependencies ?? {}),
    };
    // ── Node engine check ──────────────────────────────────────────────────────
    const nodeEngine = pkg.engines?.node;
    if (nodeEngine) {
        const major = parseVersion(nodeEngine.replace('>=', '').replace('^', '').trim());
        if (major < MIN_NODE_MAJOR) {
            findings.push({
                id: 'PKG_NODE_VERSION_OLD',
                severity: 'WARNING',
                category: 'DEPENDENCIES',
                platform: 'both',
                title: `Node.js engine requirement (${nodeEngine}) is outdated`,
                description: `Most CI/CD build systems and app store deployment pipelines use Node ${MIN_NODE_MAJOR}+. Declaring an older version can cause build failures.`,
                file: relPath,
                value: nodeEngine,
                fixSuggestion: `Update engines.node to ">=${MIN_NODE_MAJOR}"`,
            });
        }
    }
    // ── React Native version check ────────────────────────────────────────────
    const rnVersion = allDeps['react-native'];
    if (rnVersion) {
        const parts = rnVersion.replace(/[^0-9.]/g, '').split('.');
        const major = parseInt(parts[0] ?? '0', 10);
        const minor = parseInt(parts[1] ?? '0', 10);
        if (major === 0 && minor <= 71) {
            findings.push({
                id: 'PKG_RN_OUTDATED',
                severity: 'WARNING',
                category: 'DEPENDENCIES',
                platform: 'both',
                title: `React Native ${rnVersion} is outdated`,
                description: 'React Native versions below 0.71 have known security vulnerabilities and may not pass Xcode/Gradle build requirements for current store targets.',
                file: relPath,
                value: rnVersion,
                fixSuggestion: 'Upgrade to React Native 0.73+ to access New Architecture and current security patches.',
            });
        }
    }
    // ── Expo SDK version check ────────────────────────────────────────────────
    const expoVersion = allDeps['expo'];
    if (expoVersion) {
        const major = parseVersion(expoVersion);
        if (major < 49) {
            findings.push({
                id: 'PKG_EXPO_OUTDATED',
                severity: 'WARNING',
                category: 'DEPENDENCIES',
                platform: 'both',
                title: `Expo SDK ${expoVersion} is outdated`,
                description: 'Expo SDK versions below 49 do not support current Play Store target SDK requirements and have unpatched vulnerabilities.',
                file: relPath,
                value: expoVersion,
                fixSuggestion: 'Run `npx expo install --fix` and upgrade to Expo SDK 51+.',
            });
        }
    }
    // ── Flagged package audit ─────────────────────────────────────────────────
    for (const flagged of FLAGGED_PACKAGES) {
        if (flagged.name in allDeps) {
            const version = allDeps[flagged.name];
            for (const platform of flagged.platforms) {
                findings.push({
                    id: `PKG_${flagged.name.replace(/[@\-/]/g, '_').toUpperCase()}`,
                    severity: flagged.severity,
                    category: flagged.severity === 'BLOCKER' ? 'COMPLIANCE' : 'DEPENDENCIES',
                    platform,
                    title: `Package: ${flagged.name}`,
                    description: flagged.reason,
                    file: relPath,
                    value: version,
                    fixSuggestion: flagged.fix,
                    storeRule: flagged.storeRule,
                });
            }
        }
    }
    // ── Missing main field ────────────────────────────────────────────────────
    if (!pkg.main && !pkg.source && !allDeps['expo']) {
        findings.push({
            id: 'PKG_NO_MAIN',
            severity: 'INFO',
            category: 'CONFIGURATION',
            platform: 'both',
            title: 'No main entry point in package.json',
            description: 'Missing main field can cause Metro bundler to fail to find the app entry point.',
            file: relPath,
            fixSuggestion: 'Add "main": "index.js" to package.json',
        });
    }
    return {
        parserName: 'PackageJsonAudit',
        findings,
        metadata: {
            found: true,
            name: pkg.name,
            version: pkg.version,
            dependencyCount: Object.keys(pkg.dependencies ?? {}).length,
            devDependencyCount: Object.keys(pkg.devDependencies ?? {}).length,
            reactNativeVersion: rnVersion ?? null,
            expoVersion: expoVersion ?? null,
            nodeEngineRequirement: nodeEngine ?? null,
        },
    };
}
//# sourceMappingURL=PackageJsonAudit.js.map