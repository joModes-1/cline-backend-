/**
 * Apply Patch constants
 */
export const PATCH_MARKERS = {
    BEGIN: "*** Begin Patch",
    END: "*** End Patch",
    ADD: "*** Add File: ",
    UPDATE: "*** Update File: ",
    DELETE: "*** Delete File: ",
    MOVE: "*** Move to: ",
    SECTION: "@@",
    END_FILE: "*** End of File",
};
/**
 * Expected bash wrappers for apply patch content
 */
export const BASH_WRAPPERS = ["%%bash", "apply_patch", "EOF", "```"];
/**
 * Domains of patch actions
 */
export var PatchActionType;
(function (PatchActionType) {
    PatchActionType["ADD"] = "add";
    PatchActionType["DELETE"] = "delete";
    PatchActionType["UPDATE"] = "update";
})(PatchActionType || (PatchActionType = {}));
export class DiffError extends Error {
    constructor(message) {
        super(message);
        this.name = "DiffError";
    }
}
//# sourceMappingURL=Patch.js.map