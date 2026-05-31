import { Logger } from "@/shared/services/Logger";
import { telemetryService } from "../../services/telemetry";
import { getAllHooksDirs } from "../storage/disk";
import { HookFactory } from "./hook-factory";
/**
 * Singleton cache for hook script discovery with lazy file system watching.
 *
 * Features:
 * - Lazy watcher initialization (only when directories are accessed)
 * - Per-directory caching
 * - Automatic invalidation on file changes
 * - Graceful error handling
 * - Optional debug logging
 */
export class HookDiscoveryCache {
    static instance = null;
    // Cache: hookName -> discovered script paths
    cache = new Map();
    // Watchers: directory path -> file watcher
    watchers = new Map();
    // Directories we've tried to watch (even if watcher creation failed)
    watchedDirs = new Set();
    // Currently scanning promises (to prevent concurrent scans)
    scanningPromises = new Map();
    // For disposal
    context = null;
    createFileWatcher = null;
    disposed = false;
    // Debug logging (enabled via DEBUG_HOOKS env var)
    debug = process.env.DEBUG_HOOKS === "true";
    constructor() { }
    static getInstance() {
        if (!HookDiscoveryCache.instance) {
            HookDiscoveryCache.instance = new HookDiscoveryCache();
        }
        return HookDiscoveryCache.instance;
    }
    /**
     * Initialize with extension context for proper cleanup
     */
    initialize(context, createFileWatcher, onWorkspaceFoldersChanged) {
        this.context = context;
        this.createFileWatcher = createFileWatcher || null;
        // Watch for workspace changes to invalidate cache (if callback provided)
        if (onWorkspaceFoldersChanged) {
            context.subscriptions.push(onWorkspaceFoldersChanged(() => {
                this.log("Workspace folders changed, invalidating cache");
                this.invalidateAll();
            }));
        }
    }
    /**
     * Get cached hook scripts or scan if not cached
     */
    async get(hookName) {
        this.log(`Getting hooks for ${hookName}`);
        const cached = this.cache.get(hookName);
        const cacheHit = cached !== undefined;
        let scripts;
        let initiatedScan = false; // Track if this caller initiated the scan
        if (cacheHit) {
            this.log(`Cache hit for ${hookName}: ${cached.scriptPaths.length} scripts`);
            scripts = cached.scriptPaths;
        }
        else {
            this.log(`Cache miss for ${hookName}, scanning...`);
            // Check if scan is already in progress
            const existingPromise = this.scanningPromises.get(hookName);
            if (existingPromise) {
                // Another caller is already scanning, reuse their promise
                this.log(`Reusing existing scan for ${hookName}`);
                scripts = await existingPromise;
            }
            else {
                // This caller initiates the scan
                initiatedScan = true;
                scripts = await this.scan(hookName);
            }
        }
        // Only report telemetry if:
        // 1. It was a cache hit, OR
        // 2. This caller initiated the scan (not reusing another caller's promise)
        if (cacheHit || initiatedScan) {
            telemetryService.safeCapture(() => telemetryService.captureHookCacheAccess(hookName, cacheHit), "HookDiscoveryCache.get");
        }
        return scripts;
    }
    /**
     * Scan for hook scripts and cache the result
     */
    async scan(hookName) {
        // Check if a scan is already in progress for this hook
        const existingPromise = this.scanningPromises.get(hookName);
        if (existingPromise) {
            this.log(`Already scanning ${hookName}, waiting for existing scan...`);
            return existingPromise;
        }
        // Create a new scan promise
        const scanPromise = (async () => {
            try {
                // Get all current hooks directories
                const hooksDirs = await getAllHooksDirs();
                this.log(`Scanning ${hooksDirs.length} directories for ${hookName}`);
                // Ensure watchers are set up for each directory (lazy initialization)
                for (const dir of hooksDirs) {
                    this.ensureWatcher(dir);
                }
                // Scan each directory for this hook
                const scriptPromises = hooksDirs.map((dir) => HookFactory.findHookInHooksDir(hookName, dir));
                const results = await Promise.all(scriptPromises);
                const scripts = results.filter((path) => path !== undefined);
                this.log(`Found ${scripts.length} scripts for ${hookName}`);
                // Cache the result
                this.cache.set(hookName, {
                    scriptPaths: scripts,
                    timestamp: Date.now(),
                });
                return scripts;
            }
            catch (error) {
                Logger.error(`Error scanning for ${hookName} hooks:`, error);
                // Return empty array on error - don't break the whole system
                return [];
            }
            finally {
                // Remove from scanning promises map
                this.scanningPromises.delete(hookName);
            }
        })();
        // Store the promise so concurrent calls can await it
        this.scanningPromises.set(hookName, scanPromise);
        return scanPromise;
    }
    /**
     * Ensure a file watcher exists for the given directory
     */
    ensureWatcher(dir) {
        // Skip if already watching or tried to watch
        if (this.watchedDirs.has(dir)) {
            return;
        }
        this.watchedDirs.add(dir);
        if (!this.context) {
            this.log(`No context available, skipping watcher for ${dir}`);
            return;
        }
        // If no watcher creation function provided, skip watching
        if (!this.createFileWatcher) {
            this.log(`No watcher creator available, skipping watcher for ${dir}`);
            return;
        }
        try {
            // Create watcher using the provided function
            const watcher = this.createFileWatcher(dir);
            if (!watcher) {
                this.log(`Watcher creation returned null for ${dir}`);
                return;
            }
            // Invalidate cache on any change
            const invalidate = () => {
                this.log(`File change detected in ${dir}, invalidating cache`);
                this.invalidateDirectory(dir);
            };
            watcher.onDidCreate(invalidate);
            watcher.onDidChange(invalidate);
            watcher.onDidDelete(invalidate);
            // Add to context subscriptions for proper cleanup
            if (this.context) {
                this.context.subscriptions.push(watcher);
            }
            this.watchers.set(dir, watcher);
            this.log(`Created watcher for ${dir}`);
        }
        catch (error) {
            // Log but don't fail - directory might not exist yet
            this.log(`Failed to create watcher for ${dir}: ${error}`);
        }
    }
    /**
     * Invalidate all cached hooks that have scripts in this directory
     */
    invalidateDirectory(dir) {
        let invalidated = 0;
        for (const [hookName, entry] of this.cache) {
            if (entry.scriptPaths.some((scriptPath) => scriptPath.startsWith(dir))) {
                this.cache.delete(hookName);
                invalidated++;
            }
        }
        this.log(`Invalidated ${invalidated} hooks for directory ${dir}`);
    }
    /**
     * Invalidate entire cache
     */
    invalidateAll() {
        const size = this.cache.size;
        this.cache.clear();
        this.log(`Invalidated entire cache (${size} entries)`);
    }
    /**
     * Get cache statistics (for debugging/monitoring)
     */
    getStats() {
        return {
            cacheSize: this.cache.size,
            watcherCount: this.watchers.size,
            watchedDirs: this.watchedDirs.size,
        };
    }
    /**
     * Log debug message if debug mode is enabled
     */
    log(message) {
        if (this.debug) {
            Logger.log(`[HookCache] ${message}`);
        }
    }
    /**
     * Clean up resources
     */
    dispose() {
        if (this.disposed) {
            return;
        }
        this.log(`Disposing cache (${this.watchers.size} watchers)`);
        for (const watcher of this.watchers.values()) {
            watcher.dispose();
        }
        this.watchers.clear();
        this.watchedDirs.clear();
        this.cache.clear();
        this.disposed = true;
    }
    /**
     * Reset singleton instance (for testing)
     */
    static resetForTesting() {
        if (HookDiscoveryCache.instance) {
            HookDiscoveryCache.instance.dispose();
            HookDiscoveryCache.instance = null;
        }
    }
}
//# sourceMappingURL=HookDiscoveryCache.js.map