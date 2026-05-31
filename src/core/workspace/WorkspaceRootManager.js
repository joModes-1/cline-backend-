/**
 * WorkspaceRootManager - Central manager for multi-workspace operations
 * This class handles workspace root resolution, path mapping, and workspace context
 */
import { VcsType } from "@shared/multi-root/types";
import { execa } from "execa";
import * as path from "path";
import { getGitRemoteUrls, getLatestGitCommitHash } from "../../utils/git";
export class WorkspaceRootManager {
    roots = [];
    primaryIndex = 0;
    constructor(roots = [], primaryIndex = 0) {
        this.roots = roots;
        this.primaryIndex = Math.min(primaryIndex, Math.max(0, roots.length - 1));
    }
    /**
     * Initialize from a single cwd for backward compatibility
     */
    static async fromLegacyCwd(cwd) {
        const vcs = await WorkspaceRootManager.detectVcs(cwd);
        const gitHash = vcs === VcsType.Git ? await getLatestGitCommitHash(cwd) : null;
        const commitHash = gitHash === null ? undefined : gitHash;
        const root = {
            path: cwd,
            name: path.basename(cwd),
            vcs,
            commitHash,
        };
        return new WorkspaceRootManager([root], 0);
    }
    /**
     * Detect version control system for a directory
     */
    static async detectVcs(dirPath) {
        try {
            // Check for Git
            await execa("git", ["rev-parse", "--git-dir"], { cwd: dirPath });
            return VcsType.Git;
        }
        catch {
            // Not a git repo
        }
        try {
            // Check for Mercurial
            await execa("hg", ["root"], { cwd: dirPath });
            return VcsType.Mercurial;
        }
        catch {
            // Not a mercurial repo
        }
        return VcsType.None;
    }
    /**
     * Get all workspace roots
     */
    getRoots() {
        return [...this.roots];
    }
    /**
     * Get the primary workspace root
     */
    getPrimaryRoot() {
        return this.roots[this.primaryIndex];
    }
    /**
     * Get the primary workspace root index
     */
    getPrimaryIndex() {
        return this.primaryIndex;
    }
    /**
     * Set the primary workspace root by index
     */
    setPrimaryIndex(index) {
        if (index >= 0 && index < this.roots.length) {
            this.primaryIndex = index;
        }
    }
    /**
     * Find the workspace root that contains the given absolute path
     */
    resolvePathToRoot(absolutePath) {
        // Sort roots by path length (longest first) to handle nested workspaces
        const sortedRoots = [...this.roots].sort((a, b) => b.path.length - a.path.length);
        for (const root of sortedRoots) {
            if (absolutePath.startsWith(root.path)) {
                return root;
            }
        }
        return undefined;
    }
    /**
     * Find workspace root by name
     */
    getRootByName(name) {
        return this.roots.find((r) => r.name === name);
    }
    /**
     * Get workspace root by index
     */
    getRootByIndex(index) {
        return this.roots[index];
    }
    /**
     * Check if a path is within any workspace root
     */
    isPathInWorkspace(absolutePath) {
        return this.resolvePathToRoot(absolutePath) !== undefined;
    }
    /**
     * Get relative path from workspace root
     */
    getRelativePathFromRoot(absolutePath, root) {
        const targetRoot = root || this.resolvePathToRoot(absolutePath);
        if (!targetRoot) {
            return undefined;
        }
        return path.relative(targetRoot.path, absolutePath);
    }
    /**
     * Create workspace context for tool execution
     */
    createContext(currentRoot) {
        return {
            workspaceRoots: this.getRoots(),
            primaryRoot: this.getPrimaryRoot(),
            currentRoot: currentRoot || this.getPrimaryRoot(),
        };
    }
    /**
     * Serialize for storage
     */
    toJSON() {
        return {
            roots: this.roots,
            primaryIndex: this.primaryIndex,
        };
    }
    /**
     * Deserialize from storage
     */
    static fromJSON(data) {
        return new WorkspaceRootManager(data.roots, data.primaryIndex);
    }
    /**
     * Get a summary string for display
     */
    getSummary() {
        if (this.roots.length === 0) {
            return "No workspace roots configured";
        }
        if (this.roots.length === 1) {
            return `Single workspace: ${this.roots[0].name || this.roots[0].path}`;
        }
        const primary = this.getPrimaryRoot();
        return `Multi-workspace (${this.roots.length} roots)\nPrimary: ${primary?.name || primary?.path}\nAdditional: ${this.roots
            .filter((_, i) => i !== this.primaryIndex)
            .map((r) => r.name || path.basename(r.path))
            .join(", ")}`;
    }
    /**
     * Check if this is a single-root workspace (for backward compatibility)
     */
    isSingleRoot() {
        return this.roots.length === 1;
    }
    /**
     * Get the single root if this is a single-root workspace
     * Throws if multiple roots exist
     */
    getSingleRoot() {
        if (this.roots.length !== 1) {
            throw new Error(`Expected single root, but found ${this.roots.length} roots`);
        }
        return this.roots[0];
    }
    /**
     * Update commit hashes for all Git repositories
     */
    async updateCommitHashes() {
        for (const root of this.roots) {
            if (root.vcs === VcsType.Git) {
                const gitHash = await getLatestGitCommitHash(root.path);
                root.commitHash = gitHash === null ? undefined : gitHash;
            }
        }
    }
    /**
     * Build workspaces JSON structure for environment details
     */
    async buildWorkspacesJson() {
        const workspaces = {};
        // Process all workspace roots
        for (const root of this.roots) {
            const hint = root.name || path.basename(root.path);
            const gitRemotes = await getGitRemoteUrls(root.path);
            const gitCommitHash = await getLatestGitCommitHash(root.path);
            workspaces[root.path] = {
                hint,
                ...(gitRemotes.length > 0 && { associatedRemoteUrls: gitRemotes }),
                ...(gitCommitHash && { latestGitCommitHash: gitCommitHash }),
            };
        }
        // Only return JSON if there's content to feed the env details
        if (Object.keys(workspaces).length === 0) {
            return null;
        }
        return JSON.stringify({ workspaces }, null, 2);
    }
}
// Export for use in Task and Controller
export function createLegacyWorkspaceRoot(cwd) {
    return {
        path: cwd,
        name: path.basename(cwd),
        vcs: VcsType.None, // Will be detected properly during initialization
    };
}
//# sourceMappingURL=WorkspaceRootManager.js.map