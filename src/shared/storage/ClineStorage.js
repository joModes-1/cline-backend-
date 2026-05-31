import { Logger } from "../services/Logger";
/**
 * An abstract storage class that provides a template for storage operations.
 * Subclasses must implement the protected abstract methods to define their storage logic.
 * The public methods (get, store, delete) are final and cannot be overridden.
 */
export class ClineStorage {
    /**
     * The name of the storage, used for logging purposes.
     */
    name = "ClineStorage";
    /**
     * List of subscribers to storage change events.
     */
    subscribers = [];
    /**
     * Subscribe to storage change events.
     */
    onDidChange(callback) {
        this.subscribers.push(callback);
        return () => {
            const callbackIndex = this.subscribers.indexOf(callback);
            if (callbackIndex >= 0) {
                this.subscribers.splice(callbackIndex, 1);
            }
        };
    }
    /**
     * Get a value from storage. This method is final and cannot be overridden.
     * Subclasses should implement _get() to define their storage retrieval logic.
     */
    async get(key) {
        try {
            return await this._get(key);
        }
        catch {
            return undefined;
        }
    }
    async _dangerousStore(key, value) {
        await this._store(key, value);
    }
    /**
     * Store a value in storage. This method is final and cannot be overridden.
     * Subclasses should implement _store() to define their storage logic.
     * This method automatically fires change events after storing.
     */
    async store(key, value) {
        try {
            await this._dangerousStore(key, value);
        }
        catch (error) {
            Logger.error(`[${this.name}] failed to store '${key}':`, error);
        }
    }
    /**
     * Delete a value from storage. This method is final and cannot be overridden.
     * Subclasses should implement _delete() to define their deletion logic.
     * This method automatically fires change events after deletion.
     */
    async delete(key) {
        try {
            await this._delete(key);
        }
        catch {
            // Silently fail on delete errors
        }
    }
}
export class ClineSyncStorage {
    /**
     * List of subscribers to storage change events.
     */
    changeSubscribers = [];
    /**
     * Subscribe to storage change events. Returns an unsubscribe function.
     */
    onDidChange(callback) {
        this.changeSubscribers.push(callback);
        return () => {
            const idx = this.changeSubscribers.indexOf(callback);
            if (idx >= 0) {
                this.changeSubscribers.splice(idx, 1);
            }
        };
    }
    /**
     * Notify all subscribers of a key change.
     */
    fireChange(key) {
        for (const subscriber of this.changeSubscribers) {
            try {
                subscriber({ key });
            }
            catch (error) {
                Logger.error(`[${this.name}] change subscriber error for '${key}':`, error);
            }
        }
    }
    get(key, defaultValue) {
        try {
            const value = this._get(key);
            return value !== undefined ? value : defaultValue;
        }
        catch (error) {
            Logger.error(`[${this.name}] failed to get '${key}':`, error);
            return defaultValue;
        }
    }
    /**
     * Memento-compatible update method. Calls set() internally.
     */
    update(key, value) {
        this.set(key, value);
        return Promise.resolve();
    }
    set(key, value) {
        try {
            this._set(key, value);
            this.fireChange(key);
        }
        catch (error) {
            Logger.error(`[${this.name}] failed to set '${key}':`, error);
        }
    }
    delete(key) {
        try {
            this._delete(key);
            this.fireChange(key);
        }
        catch (error) {
            Logger.error(`[${this.name}] failed to delete '${key}':`, error);
        }
    }
    keys() {
        try {
            return this._keys();
        }
        catch (error) {
            Logger.error(`[${this.name}] failed to get keys:`, error);
            return [];
        }
    }
}
/**
 * A simple in-memory implementation of ClineStorage using a Map.
 */
export class ClineInMemoryStorage extends ClineStorage {
    /**
     * A simple in-memory cache to store key-value pairs.
     */
    _cache = new Map();
    async _get(key) {
        return this._cache.get(key);
    }
    async _store(key, value) {
        this._cache.set(key, value);
    }
    async _delete(key) {
        this._cache.delete(key);
    }
}
//# sourceMappingURL=ClineStorage.js.map