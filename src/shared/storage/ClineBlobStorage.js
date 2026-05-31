import { Logger } from "../services/Logger";
import { getStorageAdapter } from "./adapters";
import { ClineStorage } from "./ClineStorage";
/**
 * S3/R2 blob storage implementation of ClineStorage.
 * Uses AWS S3 or Cloudflare R2 as the backend storage.
 */
export class ClineBlobStorage extends ClineStorage {
    name = "ClineBlobStorage";
    static store = null;
    static get instance() {
        if (!ClineBlobStorage.store) {
            ClineBlobStorage.store = new ClineBlobStorage();
        }
        return ClineBlobStorage.store;
    }
    adapter;
    settings;
    initialized = false;
    /**
     * Initialize the storage adapter with the given settings.
     * Can be called multiple times - will reinitialize if settings change.
     */
    init(settings) {
        if (!settings) {
            return;
        }
        // Check if settings have changed (compare key fields)
        const settingsChanged = !this.settings ||
            this.settings.adapterType !== settings.adapterType ||
            this.settings.bucket !== settings.bucket ||
            this.settings.accessKeyId !== settings.accessKeyId ||
            this.settings.endpoint !== settings.endpoint ||
            this.settings.accountId !== settings.accountId;
        // Skip if already initialized with same settings
        if (this.initialized && !settingsChanged) {
            return;
        }
        try {
            if (!ClineBlobStorage.isConfigured(settings)) {
                // Not configured - this is expected and not an error
                return;
            }
            const adapter = getStorageAdapter(settings);
            if (adapter) {
                this.adapter = adapter;
                this.settings = settings;
                this.initialized = true;
                Logger.log(`[ClineBlobStorage] Adapter created for ${settings.adapterType}`);
            }
        }
        catch (error) {
            // Log but don't throw - allow startup to continue
            Logger.error("[ClineBlobStorage] initialization failed:", error);
        }
    }
    /**
     * Check if the storage is properly initialized and ready to use.
     */
    isReady() {
        return this.initialized && this.adapter !== undefined;
    }
    static isConfigured(settings) {
        const adapter = settings.adapterType;
        if (adapter !== "s3" && adapter !== "r2") {
            return false;
        }
        const hasRequiredVars = !!settings.bucket && !!settings.accessKeyId && !!settings.secretAccessKey;
        if (adapter === "r2") {
            return hasRequiredVars && !!(settings.accountId || settings.endpoint);
        }
        return hasRequiredVars;
    }
    async _get(key) {
        if (!this.isReady()) {
            return undefined;
        }
        try {
            return await this.adapter.read(key);
        }
        catch {
            // Silently return undefined on read errors
            return undefined;
        }
    }
    async _store(key, value) {
        if (!this.isReady()) {
            // Silently fail if not configured - this is expected behavior
            return;
        }
        try {
            await this.adapter.write(key, value);
        }
        catch (error) {
            throw error;
        }
    }
    async _delete(key) {
        if (!this.isReady()) {
            // Silently fail if not configured - this is expected behavior
            return;
        }
        try {
            await this.adapter.remove(key);
        }
        catch (error) {
            throw error;
        }
    }
}
/**
 * Get the blob storage instance if S3/R2 storage is configured.
 * Returns null if not configured.
 */
export const blobStorage = ClineBlobStorage.instance;
//# sourceMappingURL=ClineBlobStorage.js.map