import { Empty } from "@shared/proto/cline/common";
import { convertProtoTelemetrySettingToDomain } from "../../../shared/proto-conversions/state/telemetry-setting-conversion";
/**
 * Updates the telemetry setting
 * @param controller The controller instance
 * @param request The telemetry setting request
 * @returns Empty response
 */
export async function updateTelemetrySetting(controller, request) {
    const telemetrySetting = convertProtoTelemetrySettingToDomain(request.setting);
    await controller.updateTelemetrySetting(telemetrySetting);
    return Empty.create();
}
//# sourceMappingURL=updateTelemetrySetting.js.map