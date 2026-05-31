import * as fs from 'fs';
import * as path from 'path';
const PLACEHOLDER_PATTERNS = [
    {
        id: 'PLACEHOLDER_LOREM',
        regex: /lorem\s+ipsum/gi,
        title: 'Lorem Ipsum placeholder text detected',
        description: 'Lorem Ipsum placeholder text in production code is flagged by App Store human reviewers as thin/incomplete content.',
        severity: 'BLOCKER',
        fix: 'Replace all Lorem Ipsum text with real app content before submission.',
        storeRule: 'App Store Review Guideline 2.1 — App Completeness',
    },
    {
        id: 'PLACEHOLDER_COMING_SOON',
        regex: /coming\s+soon/gi,
        title: '"Coming Soon" placeholder detected',
        description: 'Screens or labels containing "Coming Soon" indicate unfinished features. Both App Store and Play Store reject apps with empty or placeholder views.',
        severity: 'BLOCKER',
        fix: 'Remove or fully implement all "Coming Soon" sections before submission.',
        storeRule: 'App Store Review Guideline 2.1',
    },
    {
        id: 'PLACEHOLDER_UNDER_CONSTRUCTION',
        regex: /under\s+construction/gi,
        title: '"Under Construction" content detected',
        description: 'Placeholder pages signal an incomplete app to store reviewers.',
        severity: 'BLOCKER',
        fix: 'Remove all "Under Construction" labels and replace with real content.',
    },
    {
        id: 'PLACEHOLDER_TODO_STRING',
        regex: /["'`]TODO["'`]|>TODO</gi,
        title: 'TODO used as UI string (not code comment)',
        description: '"TODO" appearing as a rendered string or label in UI code indicates unfished UI visible to users.',
        severity: 'WARNING',
        fix: 'Replace TODO labels with real content. Keep TODO only as code comments.',
    },
    {
        id: 'PLACEHOLDER_TEST_EMAIL',
        regex: /test@test\.(com|io|co)|example@example\.(com|io)|foo@bar\.(com|io)/gi,
        title: 'Test email address in source code',
        description: 'Hardcoded test email addresses (test@test.com, example@example.com) in source indicate development artifacts left in production code.',
        severity: 'WARNING',
        fix: 'Remove hardcoded test emails. Use environment variables or config files for any email defaults.',
    },
    {
        id: 'PLACEHOLDER_EXAMPLE_DOMAIN',
        regex: /https?:\/\/example\.(com|org|io)|https?:\/\/test\.(com|io)/gi,
        title: 'Example/test domain URLs in source',
        description: 'Placeholder domains like example.com indicate dev/mock URLs that may break production functionality.',
        severity: 'WARNING',
        fix: 'Replace all example.com / test.com URLs with real production endpoints.',
    },
    {
        id: 'PLACEHOLDER_FIXME',
        regex: /["'`]FIXME["'`]|>FIXME</gi,
        title: 'FIXME used as a UI string',
        description: 'FIXME appearing as a visible label in UI components signals unfinished work to reviewers.',
        severity: 'WARNING',
        fix: 'Replace FIXME UI labels with real content.',
    },
    {
        id: 'PLACEHOLDER_DUMMY_DATA',
        regex: /dummy\s+data|fake\s+data|mock\s+data|sample\s+data/gi,
        title: 'Dummy/fake/mock data reference in source',
        description: 'References to "dummy data", "fake data", or "mock data" in production source can indicate placeholder content is being served to users.',
        severity: 'INFO',
        fix: 'Ensure no mock/dummy data is rendered in production builds. Use environment flags to toggle.',
    },
    {
        id: 'PLACEHOLDER_HARDCODED_TEST_KEY',
        regex: /pk_test_|sk_test_|rk_test_/g,
        title: 'Stripe test API key detected in source',
        description: 'Stripe test-mode keys (pk_test_, sk_test_) in source code will cause payment failures in production.',
        severity: 'BLOCKER',
        fix: 'Replace test keys with live keys via environment variables. Never hardcode payment keys.',
    },
    {
        id: 'PLACEHOLDER_0000_PHONE',
        regex: /["'`]\+?0{7,}["'`]|\b000-000-0000\b/g,
        title: 'Placeholder phone number (all zeros)',
        description: 'Hardcoded zero-filled phone numbers indicate placeholder contact data left in source.',
        severity: 'INFO',
        fix: 'Replace with real contact information or remove hardcoded phone defaults.',
    },
];
// ─── File extensions to scan ──────────────────────────────────────────────────
const SCAN_EXTENSIONS = new Set([
    '.js', '.jsx', '.ts', '.tsx', '.dart', '.kt', '.java', '.swift',
    '.xml', '.plist', '.json', '.yaml', '.yml', '.html', '.vue',
]);
const SKIP_DIRS = new Set([
    'node_modules', '.git', 'build', 'dist', '.gradle', 'Pods',
    '.dart_tool', '.pub-cache', 'android/.gradle',
]);
// ─── Recursive file walker with extension filter ───────────────────────────────
function* walkFiles(dir, maxDepth = 8, depth = 0) {
    if (depth > maxDepth)
        return;
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    }
    catch {
        return;
    }
    for (const e of entries) {
        if (SKIP_DIRS.has(e.name))
            continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
            yield* walkFiles(full, maxDepth, depth + 1);
        }
        else if (SCAN_EXTENSIONS.has(path.extname(e.name).toLowerCase())) {
            yield full;
        }
    }
}
// ─── Main scanner ─────────────────────────────────────────────────────────────
export function scanPlaceholders(repoPath) {
    const findings = [];
    const seenIds = new Set(); // deduplicate same finding across files (cap at 3 per pattern)
    const patternHits = {};
    let filesScanned = 0;
    for (const filePath of walkFiles(repoPath)) {
        filesScanned++;
        let content;
        try {
            content = fs.readFileSync(filePath, 'utf-8');
        }
        catch {
            continue;
        }
        const relPath = path.relative(repoPath, filePath);
        for (const pattern of PLACEHOLDER_PATTERNS) {
            patternHits[pattern.id] = patternHits[pattern.id] ?? 0;
            if (patternHits[pattern.id] >= 5)
                continue; // cap findings per pattern
            pattern.regex.lastIndex = 0; // reset stateful regex
            const match = pattern.regex.exec(content);
            if (!match)
                continue;
            const dedupKey = `${pattern.id}:${relPath}`;
            if (seenIds.has(dedupKey))
                continue;
            seenIds.add(dedupKey);
            patternHits[pattern.id]++;
            // Find approximate line number
            const lineNum = content.substring(0, match.index).split('\n').length;
            findings.push({
                id: `${pattern.id}_${patternHits[pattern.id]}`,
                severity: pattern.severity,
                category: 'CONTENT',
                platform: 'both',
                title: pattern.title,
                description: pattern.description,
                file: relPath,
                line: lineNum,
                value: match[0],
                fixSuggestion: pattern.fix,
                storeRule: pattern.storeRule,
            });
        }
    }
    return {
        parserName: 'PlaceholderScanner',
        findings,
        metadata: { filesScanned, patternsChecked: PLACEHOLDER_PATTERNS.length },
    };
}
//# sourceMappingURL=PlaceholderScanner.js.map