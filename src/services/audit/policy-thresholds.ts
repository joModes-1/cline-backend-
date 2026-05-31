/**
 * Centralised store-policy thresholds.
 *
 * One source of truth for every "minimum required version" the audit cares
 * about. Previously these lived as magic numbers scattered across
 * PackageJsonAudit, ApiLevelGapDetector, PubspecParser, etc.
 *
 * UPDATE PROTOCOL
 * ───────────────
 * When Google / Apple / npm raise a requirement, bump the value here and
 * update `lastUpdated`. Bumping in one file fans out to every rule.
 *
 * Each constant carries a `since` and a `source` comment so the value is
 * defensible if questioned — no folklore numbers.
 */

export const POLICY_LAST_UPDATED = '2026-05-30'

/**
 * Google Play minimum target SDK for app updates.
 *
 *   Source: https://support.google.com/googleplay/android-developer/answer/11926878
 *   2024: 34   (Android 14)
 *   2025: 35   (Android 15) — projected
 *
 * Apps with `targetSdkVersion` below this are rejected at upload.
 */
export const ANDROID_MIN_TARGET_SDK = 34

/**
 * Recommended `compileSdkVersion`. Should always be >= target.
 */
export const ANDROID_MIN_COMPILE_SDK = ANDROID_MIN_TARGET_SDK

/**
 * minSdkVersion below this is flagged as warning (very old Android).
 * Below `ANDROID_MIN_SDK_DROP` is flagged as a near-blocker.
 */
export const ANDROID_MIN_SDK_WARN = 21
export const ANDROID_MIN_SDK_DROP = 16

/**
 * iOS deployment target. Apple drops support for iOS < 16 in Xcode 26+
 * (announced WWDC 25). Apps targeting older versions can't use
 * SwiftUI / StoreKit 2 / ATT / PrivacyInfo manifest.
 */
export const IOS_MIN_DEPLOYMENT = 16

/**
 * Node.js LTS floor. Most managed CI / app-store deploy pipelines
 * (Bitrise, EAS, Codemagic, GitHub Actions default) refuse Node < 18.
 */
export const NODE_MIN_MAJOR = 18

/**
 * React Native floor. RN 0.71+ added New Architecture support; below
 * 0.71 fails on current Xcode and has unpatched security advisories.
 */
export const RN_MIN_MINOR = 71

/**
 * Expo SDK floor. Below SDK 49 → can't hit Google Play target-SDK
 * requirement and contains unpatched advisories.
 */
export const EXPO_MIN_SDK = 49

/**
 * Flutter / Dart SDK floor. Both reached 3.0 in May 2023 (null-safe by
 * default). Earlier versions break on current pub packages.
 */
export const FLUTTER_MIN_SDK = '3.0.0'
export const DART_MIN_SDK = '3.0.0'
