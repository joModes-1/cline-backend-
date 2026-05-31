import * as fs from 'fs';
import * as path from 'path';
// ─── Apple Privacy Manifest (PrivacyInfo.xcprivacy) ──────────────────────────
// Required for all iOS apps targeting iOS 17+ (enforced from Spring 2024).
// Must declare: NSPrivacyTracking, NSPrivacyTrackingDomains,
//               NSPrivacyCollectedDataTypes, NSPrivacyAccessedAPITypes
// https://developer.apple.com/documentation/bundleresources/privacy_manifest_files
// ─── Required API categories that must be declared if used ───────────────────
const REQUIRED_API_CATEGORIES = [
    'NSPrivacyAccessedAPICategoryFileTimestamp',
    'NSPrivacyAccessedAPICategorySystemBootTime',
    'NSPrivacyAccessedAPICategoryDiskSpace',
    'NSPrivacyAccessedAPICategoryActiveKeyboards',
    'NSPrivacyAccessedAPICategoryUserDefaults',
];
// ─── Source signals that trigger required API declarations ───────────────────
const API_SIGNALS = [
    {
        category: 'NSPrivacyAccessedAPICategoryUserDefaults',
        signals: [/NSUserDefaults|UserDefaults\.standard|SharedPreferences|AsyncStorage/i],
    },
    {
        category: 'NSPrivacyAccessedAPICategoryFileTimestamp',
        signals: [/fileModificationDate|attributesOfItem|NSFileModificationDate/i],
    },
    {
        category: 'NSPrivacyAccessedAPICategoryDiskSpace',
        signals: [/volumeAvailableCapacity|NSFileSystemFreeSize|statvfs/i],
    },
    {
        category: 'NSPrivacyAccessedAPICategorySystemBootTime',
        signals: [/systemUptime|ProcessInfo\.processInfo\.systemUptime|boottime/i],
    },
];
// ─── Third-party SDK fingerprints that require PrivacyInfo ───────────────────
const SDK_REQUIRING_PRIVACY_MANIFEST = [
    { name: 'Firebase', pattern: /firebase|FirebaseCore|GoogleUtilities/i },
    { name: 'Crashlytics', pattern: /crashlytics|firebase.*crashlytics/i },
    { name: 'Facebook SDK', pattern: /FacebookCore|FacebookLogin|FBSDKCore/i },
    { name: 'Amplitude', pattern: /amplitude|AmplitudeSwift/i },
    { name: 'Segment', pattern: /segment.*analytics|Analytics\.shared/i },
    { name: 'Mixpanel', pattern: /mixpanel|Mixpanel\.initialize/i },
    { name: 'Sentry', pattern: /sentry.*ios|SentrySDK/i },
    { name: 'Branch', pattern: /Branch\.getInstance|BranchPluginSupport/i },
];
// ─── Privacy manifest candidate paths ────────────────────────────────────────
function findPrivacyManifest(repoPath) {
    const candidates = [
        'PrivacyInfo.xcprivacy',
        'ios/PrivacyInfo.xcprivacy',
        'ios/Runner/PrivacyInfo.xcprivacy',
    ];
    for (const c of candidates) {
        if (fs.existsSync(path.join(repoPath, c)))
            return c;
    }
    // Walk ios/ directory
    const iosDir = path.join(repoPath, 'ios');
    if (fs.existsSync(iosDir)) {
        try {
            const entries = fs.readdirSync(iosDir, { withFileTypes: true });
            for (const e of entries) {
                if (e.isDirectory()) {
                    const nested = path.join(iosDir, e.name, 'PrivacyInfo.xcprivacy');
                    if (fs.existsSync(nested))
                        return path.relative(repoPath, nested);
                }
            }
        }
        catch { /* skip */ }
    }
    return null;
}
function isIosProject(repoPath) {
    return (fs.existsSync(path.join(repoPath, 'ios')) ||
        fs.existsSync(path.join(repoPath, 'Info.plist')) ||
        fs.existsSync(path.join(repoPath, 'Podfile')));
}
function buildCorpus(repoPath) {
    const SCAN_EXT = new Set(['.swift', '.m', '.ts', '.tsx', '.js', '.jsx', '.dart']);
    const SKIP = new Set(['node_modules', '.git', 'build', 'Pods', '.dart_tool']);
    let corpus = '';
    function walk(dir, depth) {
        if (depth > 6)
            return;
        try {
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                if (SKIP.has(e.name))
                    continue;
                const full = path.join(dir, e.name);
                if (e.isDirectory())
                    walk(full, depth + 1);
                else if (SCAN_EXT.has(path.extname(e.name).toLowerCase())) {
                    try {
                        corpus += fs.readFileSync(full, 'utf-8') + '\n';
                    }
                    catch { /* skip */ }
                }
            }
        }
        catch { /* skip */ }
    }
    walk(repoPath, 0);
    return corpus;
}
// ─── Main checker ─────────────────────────────────────────────────────────────
export function checkPrivacyManifest(repoPath) {
    const findings = [];
    if (!isIosProject(repoPath)) {
        return { parserName: 'PrivacyManifestChecker', findings, metadata: { skipped: true, reason: 'Not an iOS project' } };
    }
    const manifestPath = findPrivacyManifest(repoPath);
    // ── Missing manifest entirely ─────────────────────────────────────────────
    if (!manifestPath) {
        findings.push({
            id: 'PRIVACY_MANIFEST_MISSING',
            severity: 'BLOCKER',
            category: 'COMPLIANCE',
            platform: 'ios',
            title: 'PrivacyInfo.xcprivacy not found',
            description: 'Apple requires a PrivacyInfo.xcprivacy manifest for all apps submitted to the App Store (enforced from Spring 2024, Xcode 15+). ' +
                'Apps uploaded without this file are rejected by App Store Connect validation.',
            fixSuggestion: 'Create PrivacyInfo.xcprivacy in your iOS project root. ' +
                'Declare NSPrivacyTracking, NSPrivacyAccessedAPITypes, and NSPrivacyCollectedDataTypes. ' +
                'See: https://developer.apple.com/documentation/bundleresources/privacy_manifest_files',
            storeRule: 'App Store — Privacy Manifest Requirements (2024)',
        });
        // Check if any SDKs are present that require it
        const corpus = buildCorpus(repoPath);
        const sdksFound = SDK_REQUIRING_PRIVACY_MANIFEST.filter(s => s.pattern.test(corpus));
        if (sdksFound.length > 0) {
            findings.push({
                id: 'PRIVACY_MANIFEST_MISSING_THIRD_PARTY_SDKS',
                severity: 'BLOCKER',
                category: 'COMPLIANCE',
                platform: 'ios',
                title: `Privacy manifest missing and ${sdksFound.length} SDK(s) require it`,
                description: `The following third-party SDKs require a PrivacyInfo.xcprivacy manifest: ${sdksFound.map(s => s.name).join(', ')}. ` +
                    `Each SDK's privacy manifest must be bundled or merged into your app's manifest.`,
                fixSuggestion: 'Create PrivacyInfo.xcprivacy. For each SDK listed, include their required API types and data categories. ' +
                    'Most SDKs (Firebase, Crashlytics, etc.) provide their own PrivacyInfo.xcprivacy — ensure Xcode merges them.',
                storeRule: 'App Store — Third-Party SDK Privacy Manifest Requirements (2024)',
            });
        }
        return { parserName: 'PrivacyManifestChecker', findings, metadata: { found: false } };
    }
    // ── Manifest exists — validate content ───────────────────────────────────
    let content = '';
    try {
        content = fs.readFileSync(path.join(repoPath, manifestPath), 'utf-8');
    }
    catch {
        findings.push({
            id: 'PRIVACY_MANIFEST_UNREADABLE',
            severity: 'BLOCKER',
            category: 'COMPLIANCE',
            platform: 'ios',
            title: 'PrivacyInfo.xcprivacy exists but could not be read',
            description: 'The privacy manifest file exists but is empty or unreadable.',
            file: manifestPath,
            fixSuggestion: 'Verify the file has valid plist content and is not empty.',
        });
        return { parserName: 'PrivacyManifestChecker', findings, metadata: { found: true, readable: false } };
    }
    // Check for required top-level keys
    const hasTracking = content.includes('NSPrivacyTracking');
    const hasAPITypes = content.includes('NSPrivacyAccessedAPITypes');
    const hasDataTypes = content.includes('NSPrivacyCollectedDataTypes');
    if (!hasTracking) {
        findings.push({
            id: 'PRIVACY_MANIFEST_NO_TRACKING_KEY',
            severity: 'WARNING',
            category: 'COMPLIANCE',
            platform: 'ios',
            title: 'NSPrivacyTracking missing from PrivacyInfo.xcprivacy',
            description: 'NSPrivacyTracking (true/false) must be declared. Set to false if your app does not track users across apps.',
            file: manifestPath,
            fixSuggestion: 'Add <key>NSPrivacyTracking</key><false/> to PrivacyInfo.xcprivacy if not tracking users.',
            storeRule: 'App Store — Privacy Manifest Requirements',
        });
    }
    if (!hasAPITypes) {
        const corpus = buildCorpus(repoPath);
        const triggeredAPIs = API_SIGNALS.filter(a => a.signals.some(re => re.test(corpus)));
        if (triggeredAPIs.length > 0) {
            findings.push({
                id: 'PRIVACY_MANIFEST_MISSING_API_TYPES',
                severity: 'WARNING',
                category: 'COMPLIANCE',
                platform: 'ios',
                title: 'NSPrivacyAccessedAPITypes missing — API usage detected',
                description: `Source code uses APIs that require declaration (${triggeredAPIs.map(a => a.category.replace('NSPrivacyAccessedAPICategory', '')).join(', ')}) ` +
                    'but NSPrivacyAccessedAPITypes is not declared in PrivacyInfo.xcprivacy.',
                file: manifestPath,
                fixSuggestion: 'Add NSPrivacyAccessedAPITypes array to PrivacyInfo.xcprivacy with the appropriate category strings for each API your app uses.',
                storeRule: 'App Store — Required Reason APIs',
            });
        }
    }
    if (!hasDataTypes) {
        findings.push({
            id: 'PRIVACY_MANIFEST_NO_DATA_TYPES',
            severity: 'INFO',
            category: 'COMPLIANCE',
            platform: 'ios',
            title: 'NSPrivacyCollectedDataTypes not declared',
            description: 'If your app collects any user data, NSPrivacyCollectedDataTypes must be declared in PrivacyInfo.xcprivacy.',
            file: manifestPath,
            fixSuggestion: 'Add NSPrivacyCollectedDataTypes array even if empty (<array/>). Required for App Store Connect validation.',
        });
    }
    return {
        parserName: 'PrivacyManifestChecker',
        findings,
        metadata: {
            found: true,
            manifestPath,
            hasNSPrivacyTracking: hasTracking,
            hasNSPrivacyAccessedAPITypes: hasAPITypes,
            hasNSPrivacyCollectedDataTypes: hasDataTypes,
        },
    };
}
//# sourceMappingURL=PrivacyManifestChecker.js.map