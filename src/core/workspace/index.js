/**
 * Workspace module exports for multi-workspace support
 */
export { addWorkspaceHint, hasWorkspaceHint, parseMultipleWorkspacePaths, parseWorkspaceInlinePath, removeWorkspaceHint, } from "./utils/parseWorkspaceInlinePath";
export { createWorkspacePathAdapter, WorkspacePathAdapter } from "./WorkspacePathAdapter";
export { getWorkspaceBasename, isWorkspaceTraceEnabled, resolveWorkspacePath, WorkspaceResolver, workspaceResolver, } from "./WorkspaceResolver";
export { createLegacyWorkspaceRoot, WorkspaceRootManager } from "./WorkspaceRootManager";
// Re-export convenience function at module level for easier imports
// Usage: import { resolveWorkspacePath } from "@core/workspace"
//# sourceMappingURL=index.js.map