export { ClineError, ClineErrorType } from "./ClineError";
export { ErrorProviderFactory } from "./ErrorProviderFactory";
export { ErrorService } from "./ErrorService";
export { PostHogErrorProvider } from "./providers/PostHogErrorProvider";
export function getErrorLevelFromString(level) {
    switch (level) {
        case "disabled":
        case "off":
            return "off";
        case "error":
        case "crash":
            return "error";
        default:
            return "all";
    }
}
//# sourceMappingURL=index.js.map