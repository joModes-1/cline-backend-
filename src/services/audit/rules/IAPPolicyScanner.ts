import * as fs from 'fs';
import * as path from 'path';
import type { AuditFinding, ParserResult } from '../AuditTypes';

// ─── Apple IAP Policy (Guideline 3.1.1) ──────────────────────────────────────
// iOS apps MUST use Apple's In-App Purchase for digital goods and subscriptions.
// External payment processors (Stripe, PayPal, Braintree, etc.) are only
// allowed for physical goods, services rendered outside the app, or B2B.
//
// Google Play has the same rule via "User Choice Billing" — external billing
// only allowed in specific regions and requires Google approval.

// ─── External payment SDK fingerprints ───────────────────────────────────────
interface PaymentSDK {
  name: string;
  patterns: RegExp[];          // source code patterns
  packagePatterns: RegExp[];   // package.json / pubspec.yaml / build.gradle patterns
  iOSBlocker: boolean;         // true = BLOCKER on iOS, false = WARNING
  androidBlocker: boolean;
  note: string;
  fix: string;
}

const PAYMENT_SDKS: PaymentSDK[] = [
  {
    name: 'Stripe',
    patterns: [/stripe/i, /StripeProvider|loadStripe|useStripe|confirmPayment/i],
    packagePatterns: [/stripe|@stripe\/stripe-react-native|stripe_payment|flutter_stripe/i],
    iOSBlocker: true,
    androidBlocker: false,
    note: 'Stripe is only allowed for physical goods on iOS. Digital purchases, subscriptions, and in-app currency must use Apple IAP.',
    fix: 'Use react-native-iap, expo-in-app-purchases, or StoreKit directly for iOS digital goods. Stripe may remain for Android or physical goods.',
  },
  {
    name: 'PayPal',
    patterns: [/paypal/i, /PayPalButtons|PayPalScriptProvider|BraintreeClient/i],
    packagePatterns: [/paypal|braintree|react-native-paypal/i],
    iOSBlocker: true,
    androidBlocker: false,
    note: 'PayPal / Braintree for in-app digital purchases violates App Store Guideline 3.1.1.',
    fix: 'Remove PayPal from iOS digital purchase flows. Use Apple IAP instead.',
  },
  {
    name: 'RevenueCat',
    patterns: [/revenuecat|Purchases\.configure|Purchases\.shared/i],
    packagePatterns: [/purchases-flutter|purchases_flutter|react-native-purchases|revenuecat/i],
    iOSBlocker: false,
    androidBlocker: false,
    note: 'RevenueCat is a compliant IAP wrapper that uses native billing on each platform. Ensure it is configured correctly.',
    fix: 'Verify RevenueCat is set to use StoreKit on iOS and Play Billing on Android — not a custom payment gateway.',
  },
  {
    name: 'Braintree',
    patterns: [/braintree|BraintreeClient|braintree\.setup/i],
    packagePatterns: [/braintree/i],
    iOSBlocker: true,
    androidBlocker: false,
    note: 'Braintree for in-app digital purchases violates App Store Guideline 3.1.1.',
    fix: 'Replace Braintree with Apple IAP for any iOS digital goods or subscriptions.',
  },
  {
    name: 'Paddle',
    patterns: [/paddle/i, /Paddle\.initialize|PaddleSDK/i],
    packagePatterns: [/paddle/i],
    iOSBlocker: true,
    androidBlocker: false,
    note: 'Paddle payment SDK detected on iOS. External payment processors are not allowed for digital goods.',
    fix: 'Use Apple IAP for iOS digital purchases. Paddle is allowed for web checkout only.',
  },
  {
    name: 'Razorpay',
    patterns: [/razorpay/i],
    packagePatterns: [/razorpay/i],
    iOSBlocker: true,
    androidBlocker: false,
    note: 'Razorpay for in-app digital purchases violates App Store IAP policy.',
    fix: 'Replace with Apple IAP for iOS digital goods.',
  },
  {
    name: 'Lemon Squeezy',
    patterns: [/lemonsqueezy|lemon.squeezy/i],
    packagePatterns: [/lemonsqueezy/i],
    iOSBlocker: true,
    androidBlocker: false,
    note: 'Lemon Squeezy is a web-only payment processor. Embedding it in an iOS app for digital goods violates IAP policy.',
    fix: 'Use Apple IAP for iOS subscriptions. Web checkout via external browser is allowed but must not be linked from within the app.',
  },
];

// ─── Native IAP signals (good — means they are compliant) ────────────────────
const NATIVE_IAP_SIGNALS: RegExp[] = [
  /StoreKit|SKPaymentQueue|SKProduct|SKPurchase/i,            // iOS native
  /BillingClient|queryProductDetails|launchBillingFlow/i,     // Android native
  /react-native-iap|expo-in-app-purchases|in_app_purchase/i,
  /Purchases\.configure|RevenueCat/i,
  /IAP|InAppPurchase|in_app_purchase/i,
];

// ─── File scan helpers ────────────────────────────────────────────────────────
const SCAN_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.dart', '.kt', '.java', '.swift', '.json', '.yaml', '.gradle']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'build', 'dist', '.gradle', 'Pods', '.dart_tool']);

function* walkFiles(dir: string, depth = 0): Generator<string> {
  if (depth > 8) return;
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walkFiles(full, depth + 1);
    else if (SCAN_EXTENSIONS.has(path.extname(e.name).toLowerCase())) yield full;
  }
}

// ─── Detect iOS build target ──────────────────────────────────────────────────
function isIosProject(repoPath: string): boolean {
  return (
    fs.existsSync(path.join(repoPath, 'ios')) ||
    fs.existsSync(path.join(repoPath, 'Info.plist')) ||
    fs.existsSync(path.join(repoPath, 'Podfile'))
  );
}

// ─── Main scanner ─────────────────────────────────────────────────────────────
export function scanIAPPolicy(repoPath: string): ParserResult {
  const findings: AuditFinding[] = [];
  const isIos = isIosProject(repoPath);

  // Build source + config corpus
  let corpus = '';
  let filesScanned = 0;
  for (const filePath of walkFiles(repoPath)) {
    if (filesScanned > 500) break;
    try { corpus += fs.readFileSync(filePath, 'utf-8') + '\n'; filesScanned++; } catch { /* skip */ }
  }

  const hasNativeIAP = NATIVE_IAP_SIGNALS.some(re => re.test(corpus));
  const detected: string[] = [];

  for (const sdk of PAYMENT_SDKS) {
    const foundInSource = sdk.patterns.some(re => re.test(corpus));
    const foundInPackage = sdk.packagePatterns.some(re => re.test(corpus));

    if (!foundInSource && !foundInPackage) continue;
    detected.push(sdk.name);

    // RevenueCat is compliant — INFO only
    if (sdk.name === 'RevenueCat') {
      findings.push({
        id: `IAP_REVENUECAT_DETECTED`,
        severity: 'INFO',
        category: 'COMPLIANCE',
        platform: 'both',
        title: 'RevenueCat IAP wrapper detected',
        description: sdk.note,
        fixSuggestion: sdk.fix,
      });
      continue;
    }

    // Blocker on iOS
    if (isIos && sdk.iOSBlocker) {
      findings.push({
        id: `IAP_EXTERNAL_SDK_${sdk.name.toUpperCase().replace(/\s/g, '_')}`,
        severity: hasNativeIAP ? 'WARNING' : 'BLOCKER',
        category: 'COMPLIANCE',
        platform: 'ios',
        title: `External payment SDK on iOS: ${sdk.name}`,
        description:
          sdk.note +
          (hasNativeIAP
            ? ' Native IAP signals were also found — verify that external payment is not used for digital goods.'
            : ' No native IAP implementation was found, suggesting all purchases go through this external processor.'),
        fixSuggestion: sdk.fix,
        storeRule: 'App Store Review Guideline 3.1.1 — Payments',
      });
    }

    // Warning on Android (allowed but worth noting)
    if (!sdk.androidBlocker) {
      findings.push({
        id: `IAP_EXTERNAL_SDK_ANDROID_${sdk.name.toUpperCase().replace(/\s/g, '_')}`,
        severity: 'INFO',
        category: 'COMPLIANCE',
        platform: 'android',
        title: `${sdk.name} payment SDK on Android`,
        description: `${sdk.name} is detected. On Android, external payment processors are allowed for physical goods and some digital goods (User Choice Billing regions).`,
        fixSuggestion: 'Verify your use case falls within Google Play Billing Policy. Physical goods and external services are exempt.',
        storeRule: 'Google Play Billing Policy',
      });
    }
  }

  // If no native IAP found and app appears to have purchases
  if (!hasNativeIAP && detected.filter(d => d !== 'RevenueCat').length > 0 && isIos) {
    findings.push({
      id: 'IAP_NO_NATIVE_IAP_FOUND',
      severity: 'WARNING',
      category: 'COMPLIANCE',
      platform: 'ios',
      title: 'No native StoreKit / IAP implementation detected',
      description:
        'External payment SDKs were found but no native Apple IAP (StoreKit) implementation was detected. ' +
        'If any digital goods or subscriptions are sold, this is a policy violation.',
      fixSuggestion:
        'Implement StoreKit or use react-native-iap / RevenueCat to handle iOS purchases natively.',
      storeRule: 'App Store Review Guideline 3.1.1',
    });
  }

  return {
    parserName: 'IAPPolicyScanner',
    findings,
    metadata: {
      filesScanned,
      isIosProject: isIos,
      externalSDKsDetected: detected,
      hasNativeIAP,
    },
  };
}
