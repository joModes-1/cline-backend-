import * as fs from 'fs';
import * as path from 'path';
// ─── Android Network Security Config ─────────────────────────────────────────
// Apps targeting API 28+ must use HTTPS by default.
// network_security_config.xml overrides can be dangerous if too permissive.
// ─── iOS App Transport Security (ATS) ────────────────────────────────────────
// Info.plist NSAppTransportSecurity keys control HTTPS enforcement.
// Full ATS bypass (NSAllowsArbitraryLoads=true) is a BLOCKER.
function findManifest(repoPath) {
    const candidates = [
        'app/src/main/AndroidManifest.xml',
        'android/app/src/main/AndroidManifest.xml',
        'AndroidManifest.xml',
    ];
    for (const c of candidates) {
        if (fs.existsSync(path.join(repoPath, c)))
            return c;
    }
    return null;
}
function findNetworkSecurityConfig(repoPath, manifestXml) {
    const m = /android:networkSecurityConfig="@xml\/([^"]+)"/.exec(manifestXml);
    if (!m)
        return null;
    const configName = m[1];
    const candidates = [
        `app/src/main/res/xml/${configName}.xml`,
        `android/app/src/main/res/xml/${configName}.xml`,
        `res/xml/${configName}.xml`,
    ];
    for (const c of candidates) {
        if (fs.existsSync(path.join(repoPath, c)))
            return c;
    }
    return null;
}
function findPlistFiles(repoPath) {
    const candidates = ['ios/Info.plist', 'Info.plist', 'ios/Runner/Info.plist'];
    return candidates.filter(c => fs.existsSync(path.join(repoPath, c)));
}
// ─── Hardcoded HTTP URL scanner ───────────────────────────────────────────────
function findHardcodedHttp(repoPath) {
    const SCAN_EXT = new Set(['.js', '.jsx', '.ts', '.tsx', '.dart', '.kt', '.java', '.swift', '.env', '.json']);
    const SKIP = new Set(['node_modules', '.git', 'build', 'dist', 'Pods', '.dart_tool']);
    const results = [];
    function walk(dir, depth) {
        if (depth > 7 || results.length > 20)
            return;
        try {
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                if (SKIP.has(e.name))
                    continue;
                const full = path.join(dir, e.name);
                if (e.isDirectory()) {
                    walk(full, depth + 1);
                    continue;
                }
                if (!SCAN_EXT.has(path.extname(e.name).toLowerCase()))
                    continue;
                try {
                    const lines = fs.readFileSync(full, 'utf-8').split('\n');
                    lines.forEach((line, idx) => {
                        // Match http:// but not https:// or localhost or 127.0.0.1 or 10.0.x (dev)
                        if (/http:\/\/(?!localhost|127\.0\.0\.1|10\.\d|192\.168)/.test(line) &&
                            !/^\s*\/\//.test(line) && // not a comment
                            !line.includes('https')) { // not https adjacent
                            results.push({
                                file: path.relative(repoPath, full),
                                line: idx + 1,
                                value: (line.match(/http:\/\/[^\s"'`]+/)?.[0] ?? 'http://...').slice(0, 80),
                            });
                        }
                    });
                }
                catch { /* skip */ }
            }
        }
        catch { /* skip */ }
    }
    walk(repoPath, 0);
    return results;
}
// ─── Main checker ─────────────────────────────────────────────────────────────
export function checkNetworkSecurity(repoPath) {
    const findings = [];
    // ── Android manifest checks ───────────────────────────────────────────────
    const manifestRelPath = findManifest(repoPath);
    if (manifestRelPath) {
        const xml = fs.readFileSync(path.join(repoPath, manifestRelPath), 'utf-8');
        // Cleartext traffic flag
        if (/android:usesCleartextTraffic="true"/.test(xml)) {
            findings.push({
                id: 'NETWORK_ANDROID_CLEARTEXT_TRAFFIC',
                severity: 'WARNING',
                category: 'SECURITY',
                platform: 'android',
                title: 'android:usesCleartextTraffic="true" — HTTP allowed globally',
                description: 'The application globally allows unencrypted HTTP traffic. ' +
                    'Google Play security scanners flag this. On Android 9+ (API 28), cleartext is blocked by default — ' +
                    'this flag overrides that protection.',
                file: manifestRelPath,
                fixSuggestion: 'Remove android:usesCleartextTraffic="true". ' +
                    'If specific domains need HTTP for dev, use a network_security_config.xml scoped to debug builds only.',
                storeRule: 'Google Play Security Policies',
            });
        }
        // Network security config analysis
        const configRelPath = findNetworkSecurityConfig(repoPath, xml);
        if (configRelPath) {
            try {
                const configXml = fs.readFileSync(path.join(repoPath, configRelPath), 'utf-8');
                if (/<base-config\s[^>]*cleartextTrafficPermitted="true"/.test(configXml)) {
                    findings.push({
                        id: 'NETWORK_SECURITY_CONFIG_CLEARTEXT_BASE',
                        severity: 'WARNING',
                        category: 'SECURITY',
                        platform: 'android',
                        title: 'network_security_config.xml allows cleartext for all domains',
                        description: 'The base-config in network_security_config.xml permits cleartext traffic for all domains. ' +
                            'This is flagged by Play Store security review for production builds.',
                        file: configRelPath,
                        fixSuggestion: 'Remove cleartextTrafficPermitted="true" from base-config. ' +
                            'Only allow cleartext for specific domains under a <domain-config> block in debug builds.',
                    });
                }
                // Certificate pinning absent for sensitive apps
                if (!configXml.includes('<pin-set') && !configXml.includes('pin sha256')) {
                    findings.push({
                        id: 'NETWORK_NO_CERTIFICATE_PINNING',
                        severity: 'INFO',
                        category: 'SECURITY',
                        platform: 'android',
                        title: 'No certificate pinning configured',
                        description: 'network_security_config.xml exists but no certificate pins are configured. ' +
                            'For apps handling sensitive data, certificate pinning prevents MITM attacks.',
                        file: configRelPath,
                        fixSuggestion: 'Add a <pin-set> block to network_security_config.xml for your production API domains. ' +
                            'See: https://developer.android.com/training/articles/security-config#CertificatePinning',
                    });
                }
                // Trust user-added CAs in base config (danger)
                if (/<base-config[^>]*>[\s\S]*?<trust-anchors[\s\S]*?<certificates src="user"/.test(configXml)) {
                    findings.push({
                        id: 'NETWORK_TRUSTS_USER_CERTIFICATES',
                        severity: 'BLOCKER',
                        category: 'SECURITY',
                        platform: 'android',
                        title: 'App trusts user-installed certificates in base config',
                        description: 'network_security_config.xml trusts user-installed CA certificates for all connections. ' +
                            'This makes the app vulnerable to MITM attacks and is a hard rejection by Google Play security review.',
                        file: configRelPath,
                        fixSuggestion: 'Remove <certificates src="user"/> from the base-config. ' +
                            'User cert trust should only appear in debug-config blocks for development proxying.',
                        storeRule: 'Google Play Security Policy — Certificate Trust',
                    });
                }
            }
            catch { /* skip unreadable */ }
        }
    }
    // ── iOS ATS checks ────────────────────────────────────────────────────────
    for (const plistPath of findPlistFiles(repoPath)) {
        try {
            const plist = fs.readFileSync(path.join(repoPath, plistPath), 'utf-8');
            if (/<key>NSAllowsArbitraryLoads<\/key>\s*<true\/>/.test(plist)) {
                findings.push({
                    id: 'NETWORK_IOS_ATS_DISABLED',
                    severity: 'WARNING',
                    category: 'SECURITY',
                    platform: 'ios',
                    title: 'NSAllowsArbitraryLoads=true — ATS fully disabled',
                    description: 'App Transport Security is fully disabled. This allows all HTTP connections without encryption. ' +
                        'Apple reviewers ask for justification when ATS is disabled. Without a valid reason, apps are rejected.',
                    file: plistPath,
                    fixSuggestion: 'Remove NSAllowsArbitraryLoads or set it to false. ' +
                        'Use NSExceptionDomains for specific domains that require HTTP (e.g., local dev server).',
                    storeRule: 'App Store Review Guideline 5.1 — Privacy',
                });
            }
            if (/<key>NSAllowsArbitraryLoadsInWebContent<\/key>\s*<true\/>/.test(plist)) {
                findings.push({
                    id: 'NETWORK_IOS_ATS_WEBCONTENT_DISABLED',
                    severity: 'INFO',
                    category: 'SECURITY',
                    platform: 'ios',
                    title: 'NSAllowsArbitraryLoadsInWebContent=true — WebView ATS disabled',
                    description: 'ATS is disabled for WebView content. If the app loads untrusted URLs in a WebView, this is a security risk.',
                    file: plistPath,
                    fixSuggestion: 'Only disable WebView ATS if your app intentionally loads third-party HTTP content. ' +
                        'Consider a domain whitelist instead.',
                });
            }
        }
        catch { /* skip */ }
    }
    // ── Hardcoded HTTP URLs in source ─────────────────────────────────────────
    const httpUrls = findHardcodedHttp(repoPath);
    if (httpUrls.length > 0) {
        const first = httpUrls[0];
        findings.push({
            id: 'NETWORK_HARDCODED_HTTP_URLS',
            severity: 'WARNING',
            category: 'SECURITY',
            platform: 'both',
            title: `${httpUrls.length} hardcoded HTTP URL(s) found in source`,
            description: `Hardcoded HTTP (non-HTTPS) URLs were found in source code (e.g. "${first.value}" at ${first.file}:${first.line}). ` +
                'These will fail on Android 9+ (cleartext blocked by default) and trigger ATS violations on iOS.',
            fixSuggestion: 'Replace all http:// URLs with https://. Use environment variables for API base URLs.',
        });
    }
    return {
        parserName: 'NetworkSecurityChecker',
        findings,
        metadata: {
            manifestFound: !!manifestRelPath,
            hardcodedHttpCount: httpUrls.length,
        },
    };
}
//# sourceMappingURL=NetworkSecurityChecker.js.map