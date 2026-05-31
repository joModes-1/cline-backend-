import { v4 as uuidv4 } from "uuid";
import { HostRegistryInfo } from "@/registry";
import { Logger } from "@/shared/services/Logger";
// Try to import node-machine-id, but don't fail if it doesn't work (e.g., when bundled)
let machineId;
// Use typeof window check to help bundlers understand this is for Node.js only
if (typeof window === 'undefined') {
    try {
        const nodeMachineId = require("node-machine-id");
        machineId = nodeMachineId.machineId;
    }
    catch {
        Logger.log("[DistinctId] node-machine-id not available, using UUID fallback");
    }
}
/*
 * Unique identifier for the current installation.
 */
let _distinctId = "";
/**
 * Some environments don't return a value for the machine ID. For these situations we generated
 * a unique ID and store it locally.
 */
export const _GENERATED_MACHINE_ID_KEY = "cline.generatedMachineId";
export async function initializeDistinctId(storage, uuid = uuidv4) {
    // Try to read the ID from storage.
    let distinctId = storage.globalState.get(_GENERATED_MACHINE_ID_KEY);
    if (!distinctId) {
        // Get the ID from the host environment.
        distinctId = await getMachineId();
    }
    if (!distinctId) {
        // Fallback to generating a unique ID and keeping in global storage.
        Logger.warn("No machine ID found for telemetry, generating UUID");
        // Add a prefix to the UUID so we can see in the telemetry how many clients are don't have a machine ID.
        distinctId = `cl-${uuid()}`;
        storage.globalState.update(_GENERATED_MACHINE_ID_KEY, distinctId);
    }
    setDistinctId(distinctId);
    await HostRegistryInfo.init(distinctId);
    Logger.log("[DistinctId] initialized:", distinctId);
}
/*
 * Get machine ID using node-machine-id package
 * This works across all platforms (VS Code, JetBrains, CLI)
 */
async function getMachineId() {
    if (!machineId) {
        return undefined;
    }
    try {
        // Get the machine ID using node-machine-id package
        // This provides a deterministic ID across different operating systems
        const id = await machineId();
        return id;
    }
    catch (error) {
        Logger.log("[DistinctId] Failed to get machine ID from node-machine-id", error);
        return undefined;
    }
}
/*
 * Set the distinct ID for logging and telemetry.
 * This is updated to Cline User ID when authenticated.
 */
export function setDistinctId(newId) {
    if (_distinctId && _distinctId !== newId) {
        Logger.log("[DistinctId] Updating...", `From ${_distinctId} to ${newId}`);
    }
    _distinctId = newId;
}
/*
 * Unique identifier for the current user
 * If authenticated, this will be the Cline User ID.
 * Else, this will be the machine ID, or the anonymous ID as a fallback.
 */
export function getDistinctId() {
    if (!_distinctId) {
        Logger.debug("[DistinctId] Not initialized. Call initializeDistinctId() first.");
    }
    return _distinctId;
}
//# sourceMappingURL=distinctId.js.map