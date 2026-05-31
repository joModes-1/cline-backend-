// Stub version of distinctId for villa server - no node-machine-id dependency
import { Logger } from "@/shared/services/Logger";
let _distinctId = "";
export const _GENERATED_MACHINE_ID_KEY = "cline.generatedMachineId";
export async function initializeDistinctId(storage) {
    // Generate a simple UUID-based ID for villa server
    _distinctId = `villa-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    Logger.log("[DistinctId] Villa server ID:", _distinctId);
}
export function setDistinctId(newId) {
    _distinctId = newId;
}
export function getDistinctId() {
    return _distinctId || "villa-unknown";
}
//# sourceMappingURL=distinctId.villa.js.map