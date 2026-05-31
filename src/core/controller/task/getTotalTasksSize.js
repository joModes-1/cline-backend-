import { getTotalTasksSize as calculateTotalTasksSize } from "../../../utils/storage";
/**
 * Gets the total size of all tasks including task data and checkpoints
 * @param controller The controller instance
 * @param _request The empty request
 * @returns The total size as an Int64 value
 */
export async function getTotalTasksSize(_controller, _request) {
    const totalSize = await calculateTotalTasksSize();
    return { value: totalSize || 0 };
}
//# sourceMappingURL=getTotalTasksSize.js.map