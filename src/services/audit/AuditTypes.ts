// ─── Villa Audit — Shared Type Contracts ────────────────────────────────────

export type Severity = 'BLOCKER' | 'WARNING' | 'INFO';

export type FindingCategory =
  | 'PERMISSIONS'
  | 'DEPENDENCIES'
  | 'CONTENT'
  | 'COMPLIANCE'
  | 'SECURITY'
  | 'CONFIGURATION';

export type Platform =
  | 'android'
  | 'ios'
  | 'react-native'
  | 'flutter'
  | 'expo'
  | 'unknown';

// ─── Individual finding emitted by any parser or rule ───────────────────────
export interface AuditFinding {
  id: string;                  // unique slug e.g. "MANIFEST_BACKGROUND_LOCATION"
  severity: Severity;
  category: FindingCategory;
  platform: Platform | 'both';
  title: string;
  description: string;
  file?: string;               // relative path inside repo
  line?: number;
  value?: string;              // the raw value that triggered the finding
  fixSuggestion: string;       // human-readable explanation of the fix
  storeRule?: string;          // e.g. "Google Play Policy 4.8.3"
  // Optional mechanical fix payload — same shape as the AI-scan issues
  // so audit findings can flow through the existing autofix pipeline
  // (POST /repos/:repoId/autofix) without a separate fix engine.
  // If `replacement` is provided, it must be a substring that should appear
  // in the file after the fix.
  suggestedFix?: {
    description: string;
    replacement: string;
  };
}

// ─── Result from each individual parser ─────────────────────────────────────
export interface ParserResult {
  parserName: string;
  findings: AuditFinding[];
  metadata?: Record<string, unknown>; // parser-specific extracted data
}

// ─── Platform detection result ───────────────────────────────────────────────
export interface PlatformProfile {
  primary: Platform;
  targets: Platform[];         // e.g. ['android', 'ios'] for React Native
  confidence: 'high' | 'medium' | 'low';
  indicators: string[];        // files/patterns that led to this conclusion
}

// ─── Final aggregated report ─────────────────────────────────────────────────
export interface AuditReport {
  repoId: string;
  repoPath: string;
  scannedAt: string;           // ISO timestamp
  durationMs: number;
  platform: PlatformProfile;
  scores: {
    android?: number;          // 0-100
    ios?: number;
    overall: number;
  };
  findings: AuditFinding[];
  summary: {
    blockers: number;
    warnings: number;
    info: number;
    storeReady: boolean;       // true only if blockers === 0
  };
  parsersRun: string[];
}

// ─── Config passed to AuditEngine ────────────────────────────────────────────
export interface AuditConfig {
  repoId: string;
  repoPath: string;            // absolute path to extracted repo on disk
  platforms?: Platform[];      // override auto-detection
  skipParsers?: string[];      // parser names to skip
}
