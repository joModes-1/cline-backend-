/**
 * Workspace root types and interfaces for multi-workspace support
 */
export var VcsType;
(function (VcsType) {
    VcsType["None"] = "none";
    VcsType["Git"] = "git";
    VcsType["Mercurial"] = "mercurial";
})(VcsType || (VcsType = {}));
// Example usage:
// const workspaceRoots: WorkspaceRoot[] = [
//   {
//     path: "/Users/dev/frontend",
//     name: "frontend",
//     vcs: VcsType.Git,
//     commitHash: "a1b2c3d4e5f6789"
//   },
//   {
//     path: "/Users/dev/backend",
//     name: "backend",
//     vcs: VcsType.Git,
//     commitHash: "f6e5d4c3b2a1987"
//   }
// ]
//# sourceMappingURL=types.js.map