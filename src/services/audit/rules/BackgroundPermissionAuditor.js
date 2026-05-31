import * as fs from 'fs';
import * as path from 'path';
const BACKGROUND_RULES = [
    {
        permission: 'android.permission.ACCESS_BACKGROUND_LOCATION',
        label: 'Background Location',
        severity: 'BLOCKER',
        requiresDeclaration: true,
        justificationSignals: [
            /BackgroundLocation|startLocationUpdatesAsync|background.*location/i,
            /ActivityRecognition|geofenc|LocationService.*extends.*Service/i,
            /requestAlwaysAuthorization/i,
        ],
        rejectionRisk: 'Google Play manually reviews all apps requesting background location. ' +
            'Without a valid core feature requiring it (navigation, fitness tracking, geofencing), this is rejected.',
        fix: 'Remove ACCESS_BACKGROUND_LOCATION unless your core feature requires it. ' +
            'Submit a Permissions Declaration Form in the Play Console explaining the use case. ' +
            'Access fine location when-in-use instead where possible.',
        storeRule: 'Google Play Location Permissions Policy',
    },
    {
        permission: 'android.permission.FOREGROUND_SERVICE',
        label: 'Foreground Service',
        severity: 'WARNING',
        requiresDeclaration: true,
        justificationSignals: [
            /ForegroundService|startForeground|ForegroundServiceType/i,
            /Service.*extends.*Service|IntentService/i,
        ],
        rejectionRisk: 'Foreground services are scrutinized by Play Store reviewers for battery abuse and background data collection.',
        fix: 'Declare a foregroundServiceType in the <service> tag. ' +
            'Only use foreground services for user-visible, ongoing tasks (media playback, navigation, uploads).',
        storeRule: 'Google Play Foreground Services Policy',
    },
    {
        permission: 'android.permission.RECEIVE_BOOT_COMPLETED',
        label: 'Boot Receiver',
        severity: 'WARNING',
        requiresDeclaration: false,
        justificationSignals: [
            /BOOT_COMPLETED|onReceive.*boot|BackgroundFetch|WorkManager/i,
            /JobScheduler|AlarmManager.*BOOT/i,
        ],
        rejectionRisk: 'Boot receivers that silently start background activity are flagged for battery / resource abuse by Play Store scanners.',
        fix: 'Ensure the boot receiver only schedules lightweight background tasks (WorkManager jobs). ' +
            'Do not start heavy services or network operations directly from RECEIVE_BOOT_COMPLETED.',
    },
    {
        permission: 'android.permission.REQUEST_INSTALL_PACKAGES',
        label: 'Install Packages',
        severity: 'BLOCKER',
        requiresDeclaration: true,
        justificationSignals: [
            /PackageInstaller|installPackage|requestInstallPackages|apk.*install/i,
        ],
        rejectionRisk: 'Apps requesting REQUEST_INSTALL_PACKAGES that are not device management, enterprise MDM, or app stores are rejected outright.',
        fix: 'Remove REQUEST_INSTALL_PACKAGES unless your app is explicitly an APK installer, MDM agent, or enterprise tool. ' +
            'Submit justification via the Play Console Permissions Declaration Form.',
        storeRule: 'Google Play Install Packages Policy',
    },
    {
        permission: 'android.permission.SYSTEM_ALERT_WINDOW',
        label: 'Draw Over Other Apps',
        severity: 'BLOCKER',
        requiresDeclaration: true,
        justificationSignals: [
            /WindowManager\.LayoutParams.*TYPE_APPLICATION_OVERLAY|SYSTEM_ALERT_WINDOW|drawOverlay/i,
            /ACTION_MANAGE_OVERLAY_PERMISSION/i,
        ],
        rejectionRisk: 'SYSTEM_ALERT_WINDOW (draw over other apps) requires Google approval. ' +
            'Only productivity, accessibility, and bubble-notification apps qualify. Consumer apps are rejected.',
        fix: 'Remove SYSTEM_ALERT_WINDOW unless your app requires overlay functionality as a core feature. ' +
            'Submit detailed justification via the Play Console.',
        storeRule: 'Google Play Permissions Policy — Overlay',
    },
    {
        permission: 'android.permission.MANAGE_EXTERNAL_STORAGE',
        label: 'All Files Access',
        severity: 'BLOCKER',
        requiresDeclaration: true,
        justificationSignals: [
            /MANAGE_EXTERNAL_STORAGE|ACTION_MANAGE_APP_ALL_FILES|allFilesAccess/i,
            /file.*manager|document.*picker.*all|MediaStore.*external/i,
        ],
        rejectionRisk: 'MANAGE_EXTERNAL_STORAGE (All Files Access) is restricted to file managers, AV scanners, and backup apps. ' +
            'General apps requesting this are rejected. Google manually reviews each submission.',
        fix: 'Replace MANAGE_EXTERNAL_STORAGE with scoped storage APIs (MediaStore, Storage Access Framework). ' +
            'Only request this if your app is a legitimate file manager.',
        storeRule: 'Google Play Permissions Policy — Storage',
    },
];
// ─── Find AndroidManifest ─────────────────────────────────────────────────────
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
function hasPermission(xml, permission) {
    return xml.includes(`android:name="${permission}"`);
}
// ─── Build source corpus for justification check ──────────────────────────────
function buildSourceCorpus(repoPath) {
    const SCAN_EXT = new Set(['.js', '.jsx', '.ts', '.tsx', '.dart', '.kt', '.java', '.swift']);
    const SKIP = new Set(['node_modules', '.git', 'build', 'dist', '.gradle', 'Pods']);
    let corpus = '';
    let count = 0;
    function walk(dir, depth) {
        if (depth > 7 || count > 300)
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
                        count++;
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
// ─── Main auditor ─────────────────────────────────────────────────────────────
export function auditBackgroundPermissions(repoPath) {
    const findings = [];
    const manifestRelPath = findManifest(repoPath);
    if (!manifestRelPath) {
        return { parserName: 'BackgroundPermissionAuditor', findings, metadata: { manifestFound: false } };
    }
    const xml = fs.readFileSync(path.join(repoPath, manifestRelPath), 'utf-8');
    const corpus = buildSourceCorpus(repoPath);
    const flagged = [];
    const justified = [];
    const needsDeclaration = [];
    for (const rule of BACKGROUND_RULES) {
        if (!hasPermission(xml, rule.permission))
            continue;
        const isJustified = rule.justificationSignals.some(re => re.test(corpus));
        if (!isJustified) {
            flagged.push(rule.label);
            if (rule.requiresDeclaration)
                needsDeclaration.push(rule.label);
            findings.push({
                id: `BG_PERM_UNJUSTIFIED_${rule.permission.split('.').pop()}`,
                severity: rule.severity,
                category: 'PERMISSIONS',
                platform: 'android',
                title: `Unjustified background permission: ${rule.label}`,
                description: `${rule.permission} is declared in AndroidManifest.xml but no corresponding usage was found in source code. ` +
                    rule.rejectionRisk,
                file: manifestRelPath,
                value: rule.permission,
                fixSuggestion: rule.fix,
                storeRule: rule.storeRule,
            });
        }
        else {
            justified.push(rule.label);
            // Still needs a Play Declaration Form even if justified
            if (rule.requiresDeclaration) {
                needsDeclaration.push(rule.label);
                findings.push({
                    id: `BG_PERM_DECLARATION_REQUIRED_${rule.permission.split('.').pop()}`,
                    severity: 'WARNING',
                    category: 'COMPLIANCE',
                    platform: 'android',
                    title: `Play Console Permissions Declaration required: ${rule.label}`,
                    description: `${rule.permission} is declared and appears to be actively used. ` +
                        `However, Google requires a Permissions Declaration Form submitted in the Play Console for this permission. ` +
                        `Without it, the app will be rejected during review.`,
                    file: manifestRelPath,
                    value: rule.permission,
                    fixSuggestion: 'In Google Play Console → App Content → Permissions Declaration, submit a detailed explanation of why this permission is required for core app functionality.',
                    storeRule: rule.storeRule,
                });
            }
        }
    }
    return {
        parserName: 'BackgroundPermissionAuditor',
        findings,
        metadata: {
            manifestFound: true,
            flaggedPermissions: flagged,
            justifiedPermissions: justified,
            requiresPlayDeclaration: needsDeclaration,
        },
    };
}
//# sourceMappingURL=BackgroundPermissionAuditor.js.map