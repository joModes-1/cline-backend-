import * as fs from 'fs';
import * as path from 'path';
import type { AuditFinding, ParserResult } from './AuditTypes';

// ─── Map: manifest permission → source code signals that justify it ───────────
interface PermissionSignal {
  permission: string;          // Android permission string
  jsSignals: RegExp[];         // patterns in JS/TS/Dart that indicate legitimate use
  apiSignals: RegExp[];        // native API patterns in Java/Kotlin/Swift
  label: string;
}

const PERMISSION_SIGNALS: PermissionSignal[] = [
  {
    permission: 'android.permission.CAMERA',
    label: 'Camera',
    jsSignals: [
      /Camera|useCamera|launchCamera|ImagePicker|expo-camera|react-native-camera|vision-camera/i,
      /requestCameraPermission|getCameraPermissionStatus/i,
    ],
    apiSignals: [/CameraX|Camera2|ImageCapture|SurfaceView/i],
  },
  {
    permission: 'android.permission.ACCESS_FINE_LOCATION',
    label: 'Precise Location',
    jsSignals: [
      /Geolocation|getCurrentPosition|watchPosition|expo-location|react-native-geolocation/i,
      /requestForegroundPermissionsAsync|useLocation/i,
    ],
    apiSignals: [/FusedLocationProviderClient|LocationManager|requestLocationUpdates/i],
  },
  {
    permission: 'android.permission.ACCESS_COARSE_LOCATION',
    label: 'Approximate Location',
    jsSignals: [
      /Geolocation|getCurrentPosition|expo-location|react-native-geolocation/i,
    ],
    apiSignals: [/LocationManager|getLastKnownLocation/i],
  },
  {
    permission: 'android.permission.RECORD_AUDIO',
    label: 'Microphone',
    jsSignals: [
      /Audio|Microphone|expo-av|react-native-audio|SpeechRecognition|MediaRecorder/i,
    ],
    apiSignals: [/MediaRecorder|AudioRecord|AudioManager/i],
  },
  {
    permission: 'android.permission.READ_CONTACTS',
    label: 'Contacts (Read)',
    jsSignals: [/Contacts|expo-contacts|react-native-contacts/i],
    apiSignals: [/ContentResolver.*ContactsContract|ContactsProvider/i],
  },
  {
    permission: 'android.permission.RECEIVE_BOOT_COMPLETED',
    label: 'Boot Receiver',
    jsSignals: [/BackgroundFetch|expo-background-fetch|react-native-background-job/i],
    apiSignals: [/BroadcastReceiver.*BOOT|onReceive.*Intent.ACTION_BOOT/i],
  },
  {
    permission: 'android.permission.ACCESS_BACKGROUND_LOCATION',
    label: 'Background Location',
    jsSignals: [
      /BackgroundLocation|startLocationUpdatesAsync|watchPositionAsync.*background/i,
      /ActivityRecognition|geofenc/i,
    ],
    apiSignals: [/BACKGROUND_LOCATION|startForegroundService/i],
  },
];

// ─── File extensions to search for signals ────────────────────────────────────
const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.dart', '.kt', '.java', '.swift']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'build', 'dist', '.gradle', 'Pods', '.dart_tool']);

function* walkSourceFiles(dir: string, depth = 0): Generator<string> {
  if (depth > 8) return;
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walkSourceFiles(full, depth + 1);
    else if (SOURCE_EXTENSIONS.has(path.extname(e.name).toLowerCase())) yield full;
  }
}

// ─── Extract permissions from manifest (reuse regex approach) ────────────────
function extractManifestPermissions(repoPath: string): string[] {
  const candidates = [
    'app/src/main/AndroidManifest.xml',
    'android/app/src/main/AndroidManifest.xml',
    'AndroidManifest.xml',
  ];
  for (const c of candidates) {
    const full = path.join(repoPath, c);
    if (!fs.existsSync(full)) continue;
    const xml = fs.readFileSync(full, 'utf-8');
    const re = /android:name="([^"]+)"/g;
    const perms: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) {
      if (m[1].startsWith('android.permission.')) perms.push(m[1]);
    }
    return perms;
  }
  return [];
}

// ─── Build corpus of all source file content ──────────────────────────────────
function buildSourceCorpus(repoPath: string): string {
  let corpus = '';
  let fileCount = 0;
  for (const filePath of walkSourceFiles(repoPath)) {
    if (fileCount > 300) break; // cap to avoid memory issues on huge repos
    try {
      corpus += fs.readFileSync(filePath, 'utf-8') + '\n';
      fileCount++;
    } catch { /* skip */ }
  }
  return corpus;
}

// ─── Main mapper ──────────────────────────────────────────────────────────────
export function mapPermissions(repoPath: string): ParserResult {
  const findings: AuditFinding[] = [];
  const permissions = extractManifestPermissions(repoPath);

  if (permissions.length === 0) {
    return {
      parserName: 'PermissionMapper',
      findings,
      metadata: { manifestFound: false, permissionsChecked: 0 },
    };
  }

  const corpus = buildSourceCorpus(repoPath);
  const orphaned: string[] = [];
  const justified: string[] = [];

  for (const permission of permissions) {
    const signal = PERMISSION_SIGNALS.find(s => s.permission === permission);
    if (!signal) {
      // Unknown permission — can't map, skip
      continue;
    }

    const allSignals = [...signal.jsSignals, ...signal.apiSignals];
    const hasSignal = allSignals.some(re => re.test(corpus));

    if (!hasSignal) {
      orphaned.push(permission);
      findings.push({
        id: `PERM_ORPHAN_${permission.split('.').pop()}`,
        severity: 'BLOCKER',
        category: 'PERMISSIONS',
        platform: 'android',
        title: `Orphan permission: ${signal.label} (${permission.split('.').pop()})`,
        description: `${permission} is declared in AndroidManifest.xml but no corresponding API usage was found in source code. Google Play's automated review flags permissions that don't align with app functionality.`,
        fixSuggestion: `Either remove ${permission} from AndroidManifest.xml, or add the feature that uses it. Orphan permissions are a top rejection cause.`,
        value: permission,
        storeRule: 'Google Play Policy — Permissions (Section 4.1)',
      });
    } else {
      justified.push(permission);
    }
  }

  return {
    parserName: 'PermissionMapper',
    findings,
    metadata: {
      manifestFound: true,
      permissionsChecked: permissions.length,
      orphaned,
      justified,
      orphanedCount: orphaned.length,
    },
  };
}
