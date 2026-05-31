import { resolveWorkspacePath } from "@/core/workspace";
/**
 * Utility class for resolving and validating file paths within a task context
 */
export class PathResolver {
    config;
    validator;
    constructor(config, validator) {
        this.config = config;
        this.validator = validator;
    }
    resolve(filePath, caller) {
        try {
            const pathResult = resolveWorkspacePath(this.config, filePath, caller);
            return typeof pathResult === "string"
                ? { absolutePath: pathResult, resolvedPath: filePath }
                : { absolutePath: pathResult.absolutePath, resolvedPath: pathResult.resolvedPath };
        }
        catch {
            return undefined;
        }
    }
    validate(resolvedPath) {
        return this.validator.checkClineIgnorePath(resolvedPath);
    }
    async resolveAndValidate(filePath, caller) {
        const resolution = this.resolve(filePath, caller);
        if (!resolution) {
            return undefined;
        }
        const validation = this.validate(resolution.resolvedPath);
        if (!validation.ok) {
            return undefined;
        }
        return resolution;
    }
}
//# sourceMappingURL=PathResolver.js.map