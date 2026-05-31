import * as fs from 'fs';
import * as path from 'path';
import type { AuditFinding, ParserResult } from '../AuditTypes';

// ─── Debug flag patterns across all platform config files ────────────────────
// These are the exact patterns that trigger automated store rejection bots
// and human reviewers who check for production-readiness.

interface DebugCheck {
  id: string;
  label: string;
  filePatterns: string[];          // which files to check (relative paths / globs)
  contentPattern: RegExp;          // pattern in file content that flags it
  excludePattern?: RegExp;         // if also matches this, it's a false positive (e.g. build type scoped)
  severity: 'BLOCKER' | 'WARNING' | 'INFO';
  description: string;
  fix: string;
  storeRule?: string;
  // Optional mechanical replacement payload — when present, autofix can
  // apply the fix without human input. Same shape as AuditFinding.suggestedFix.
  // `replacement` MUST be a substring that should appear in the file AFTER
  // the fix is applied (the autofix short-circuit uses includes()).
  suggestedFix?: { description: string; replacement: string };
}

const DEBUG_CHECKS: DebugCheck[] = [
  // ── Android Manifest ────────────────────────────────────────────────────────
  {
    id: 'DEBUG_ANDROID_DEBUGGABLE',
    label: 'android:debuggable="true" in manifest',
    filePatterns: [
      'app/src/main/AndroidManifest.xml',
      'android/app/src/main/AndroidManifest.xml',
      'AndroidManifest.xml',
    ],
    contentPattern: /android:debuggable="true"/,
    severity: 'BLOCKER',
    description:
      'android:debuggable="true" is present in the production manifest. ' +
      'This allows USB debugging, breakpoint attachment, and memory inspection on end-user devices. ' +
      'Google Play automatically rejects apps with this flag set in release builds.',
    fix:
      'Remove android:debuggable="true" from AndroidManifest.xml. ' +
      'The Android build system (Gradle) automatically sets debuggable based on build type — do not set it manually.',
    storeRule: 'Google Play — App Security Policy',
  },
  {
    id: 'DEBUG_ANDROID_TEST_ONLY',
    label: 'android:testOnly="true" in manifest',
    filePatterns: [
      'app/src/main/AndroidManifest.xml',
      'android/app/src/main/AndroidManifest.xml',
    ],
    contentPattern: /android:testOnly="true"/,
    severity: 'BLOCKER',
    description:
      'android:testOnly="true" prevents the app from being installed via the Play Store. ' +
      'This flag is used during development/testing only.',
    fix: 'Remove android:testOnly="true" from the production manifest.',
  },

  // ── Gradle build config ─────────────────────────────────────────────────────
  {
    id: 'DEBUG_GRADLE_SIGNING_DEBUG',
    label: 'Release build uses debug signing config',
    filePatterns: [
      'app/build.gradle',
      'android/app/build.gradle',
      'app/build.gradle.kts',
    ],
    contentPattern: /release\s*\{[^}]*signingConfig\s+signingConfigs\.debug/s,
    severity: 'BLOCKER',
    description:
      'The release build variant is configured to use the debug signing certificate. ' +
      'Apps signed with debug keys cannot be uploaded to Google Play and will fail in production.',
    fix:
      'Configure a production signing key in Gradle. ' +
      'Store the keystore path and credentials in environment variables or a secrets manager — never commit them to git.',
  },
  {
    id: 'DEBUG_GRADLE_MINIFY_DISABLED',
    label: 'Minification disabled in release build',
    filePatterns: [
      'app/build.gradle',
      'android/app/build.gradle',
    ],
    contentPattern: /release\s*\{[^}]*minifyEnabled\s+false/s,
    severity: 'WARNING',
    description:
      'minifyEnabled false in the release build disables R8/ProGuard code shrinking and obfuscation. ' +
      'This exposes internal API keys, class names, and business logic to reverse engineering.',
    fix: 'Set minifyEnabled true in the release build type and configure a proguard-rules.pro file.',
    suggestedFix: {
      description: 'Enable minification for release builds',
      replacement: 'minifyEnabled true',
    },
  },

  // ── Environment / config files ──────────────────────────────────────────────
  {
    id: 'DEBUG_ENV_DEBUG_TRUE',
    label: 'DEBUG=true in committed .env file',
    filePatterns: ['.env', '.env.production', '.env.prod'],
    contentPattern: /^\s*DEBUG\s*=\s*true/mi,
    excludePattern: /^\s*#/,
    severity: 'WARNING',
    description:
      'DEBUG=true found in a committed .env file. This enables verbose logging, stack traces, and ' +
      'development endpoints in production, exposing sensitive information to users.',
    fix:
      'Set DEBUG=false in production .env files. ' +
      'Better yet: do not commit .env files — add them to .gitignore and use CI/CD secrets.',
    suggestedFix: {
      description: 'Disable DEBUG mode in committed env file',
      replacement: 'DEBUG=false',
    },
  },
  {
    id: 'DEBUG_ENV_NODE_ENV_DEVELOPMENT',
    label: 'NODE_ENV=development in production config',
    filePatterns: ['.env.production', '.env.prod', '.env'],
    contentPattern: /^\s*NODE_ENV\s*=\s*development/mi,
    severity: 'WARNING',
    description:
      'NODE_ENV=development in a production config file disables production optimizations, ' +
      'enables dev-only error messages, and can expose stack traces to users.',
    fix: 'Set NODE_ENV=production in all production environment configs.',
    suggestedFix: {
      description: 'Flip NODE_ENV to production',
      replacement: 'NODE_ENV=production',
    },
  },

  // ── iOS / Xcode ──────────────────────────────────────────────────────────────
  {
    id: 'DEBUG_IOS_FLIPPER_PRODUCTION',
    label: 'Flipper debug tool in production',
    filePatterns: ['ios/Podfile', 'Podfile'],
    contentPattern: /use_flipper|FlipperKit/i,
    excludePattern: /#\s*use_flipper/,  // commented out is fine
    severity: 'WARNING',
    description:
      'Flipper (Facebook debug tool) is enabled in the Podfile. Shipping Flipper in a production build ' +
      'increases app size, may cause crashes on non-debug devices, and exposes internal network traffic.',
    fix:
      "Wrap Flipper in a debug-only condition:\n" +
      "if ENV['BUILD_ENV'] != 'release'\n  use_flipper!()\nend",
  },

  // ── JavaScript / React Native ────────────────────────────────────────────────
  {
    id: 'DEBUG_JS_CONSOLE_WARN_DISABLED',
    label: 'console.warn/error disabled in production',
    filePatterns: ['index.js', 'App.js', 'App.tsx', 'src/index.ts'],
    contentPattern: /console\.(warn|error|log)\s*=\s*\(\s*\)\s*=>\s*\{\s*\}/,
    severity: 'INFO',
    description:
      'console.warn/error is suppressed globally. This can hide critical runtime errors from crash reporters.',
    fix: 'Use a proper logging library (e.g., react-native-logs) that routes errors to crash reporters in production.',
  },
  {
    id: 'DEBUG_REACT_DEVTOOLS',
    label: 'React DevTools / remote debugger connection in source',
    filePatterns: ['index.js', 'App.js', 'App.tsx', 'src/index.ts'],
    contentPattern: /connectToDevTools|Remote.*Debugger|__REACT_DEVTOOLS_GLOBAL_HOOK__/i,
    severity: 'WARNING',
    description:
      'React DevTools connection code found in source. Shipping this in production exposes app state to connected debuggers.',
    fix: 'Wrap DevTools connections in __DEV__ checks: if (__DEV__) { connectToDevTools(); }',
  },
];

// ─── Committed secrets scanner ────────────────────────────────────────────────
const SECRET_PATTERNS: { id: string; label: string; pattern: RegExp; fix: string }[] = [
  {
    id: 'DEBUG_COMMITTED_KEYSTORE_PASSWORD',
    label: 'Keystore password committed to source',
    pattern: /storePassword\s*=?\s*["'][^"']{4,}["']|keyPassword\s*=?\s*["'][^"']{4,}["']/,
    fix: 'Move keystore passwords to environment variables or a secrets manager. Remove from build.gradle.',
  },
  {
    id: 'DEBUG_COMMITTED_API_KEY',
    label: 'API key committed in build config',
    pattern: /apiKey\s*=?\s*["'](?!YOUR_|REPLACE|PLACEHOLDER)[A-Za-z0-9_\-]{20,}["']/,
    fix: 'Store API keys in local.properties or environment variables. Never commit them to version control.',
  },
];

// ─── File reader helper ───────────────────────────────────────────────────────
function readFile(repoPath: string, relPaths: string[]): { content: string; foundAt: string } | null {
  for (const rel of relPaths) {
    const full = path.join(repoPath, rel);
    if (!fs.existsSync(full)) continue;
    try {
      return { content: fs.readFileSync(full, 'utf-8'), foundAt: rel };
    } catch { /* skip */ }
  }
  return null;
}

// ─── Build file corpus for secret scan ───────────────────────────────────────
function buildBuildCorpus(repoPath: string): { content: string; file: string }[] {
  const BUILD_FILES = [
    'app/build.gradle', 'android/app/build.gradle',
    'app/build.gradle.kts', 'android/app/build.gradle.kts',
    'build.gradle', 'local.properties',
    'gradle.properties', 'android/gradle.properties',
  ];
  return BUILD_FILES
    .filter(f => fs.existsSync(path.join(repoPath, f)))
    .map(f => {
      try { return { content: fs.readFileSync(path.join(repoPath, f), 'utf-8'), file: f }; }
      catch { return null; }
    })
    .filter(Boolean) as { content: string; file: string }[];
}

// ─── Main detector ────────────────────────────────────────────────────────────
export function detectDebugFlags(repoPath: string): ParserResult {
  const findings: AuditFinding[] = [];

  // ── Run each debug check ──────────────────────────────────────────────────
  for (const check of DEBUG_CHECKS) {
    const result = readFile(repoPath, check.filePatterns);
    if (!result) continue;
    const { content, foundAt } = result;

    if (!check.contentPattern.test(content)) continue;
    if (check.excludePattern?.test(content)) continue;

    findings.push({
      id: check.id,
      severity: check.severity,
      category: 'SECURITY',
      platform: 'both',
      title: check.label,
      description: check.description,
      file: foundAt,
      fixSuggestion: check.fix,
      storeRule: check.storeRule,
      suggestedFix: check.suggestedFix,
    });
  }

  // ── Secrets in build files ────────────────────────────────────────────────
  const buildFiles = buildBuildCorpus(repoPath);
  for (const { content, file } of buildFiles) {
    for (const secret of SECRET_PATTERNS) {
      if (secret.pattern.test(content)) {
        findings.push({
          id: secret.id,
          severity: 'BLOCKER',
          category: 'SECURITY',
          platform: 'android',
          title: secret.label,
          description: `${secret.label} found in ${file}. Committing credentials to version control exposes them to anyone with repo access.`,
          file,
          fixSuggestion: secret.fix,
        });
      }
    }
  }

  // ── .gitignore check ──────────────────────────────────────────────────────
  const gitignorePath = path.join(repoPath, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    try {
      const gitignore = fs.readFileSync(gitignorePath, 'utf-8');
      // Check if .env files are tracked
      if (!gitignore.includes('.env') && (
        fs.existsSync(path.join(repoPath, '.env')) ||
        fs.existsSync(path.join(repoPath, '.env.production'))
      )) {
        findings.push({
          id: 'DEBUG_ENV_NOT_GITIGNORED',
          severity: 'BLOCKER',
          category: 'SECURITY',
          platform: 'both',
          title: '.env files not in .gitignore',
          description:
            '.env file(s) exist in the repo but .gitignore does not exclude them. ' +
            'This means API keys, database credentials, and secrets are committed to version control.',
          file: '.gitignore',
          fixSuggestion: 'Add .env, .env.*, and local.properties to .gitignore immediately. ' +
            'Rotate any secrets that may have been exposed.',
          storeRule: 'Google Play / App Store — No hardcoded secrets in apps',
        });
      }
    } catch { /* skip */ }
  }

  return {
    parserName: 'DebugFlagDetector',
    findings,
    metadata: { checksRun: DEBUG_CHECKS.length },
  };
}
