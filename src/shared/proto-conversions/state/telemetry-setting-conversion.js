import { TelemetrySettingEnum } from "@shared/proto/cline/state";
/**
 * Converts a domain TelemetrySetting string to a proto TelemetrySettingEnum
 */
export function convertDomainTelemetrySettingToProto(setting) {
    switch (setting) {
        case "unset":
            return TelemetrySettingEnum.UNSET;
        case "enabled":
            return TelemetrySettingEnum.ENABLED;
        case "disabled":
            return TelemetrySettingEnum.DISABLED;
        default:
            return TelemetrySettingEnum.UNSET;
    }
}
/**
 * Converts a proto TelemetrySettingEnum to a domain TelemetrySetting string
 */
export function convertProtoTelemetrySettingToDomain(setting) {
    switch (setting) {
        case TelemetrySettingEnum.UNSET:
            return "unset";
        case TelemetrySettingEnum.ENABLED:
            return "enabled";
        case TelemetrySettingEnum.DISABLED:
            return "disabled";
        default:
            return "unset";
    }
}
//# sourceMappingURL=telemetry-setting-conversion.js.map