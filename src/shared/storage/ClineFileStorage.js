import * as fs from "node:fs";
import * as path from "node:path";
import { Logger } from "../services/Logger";
import { ClineSyncStorage } from "./ClineStorage";
/**
 * Synchronous file-backed JSON storage.
 * Stores any JSON-serializable values with sync read and write.
 * Used for VSCode Memento compatibility and CLI environments.
 */
export class ClineFileStorage extends ClineSyncStorage {
    name;
    data;
    fsPath;
    fileMode;
    constructor(filePath, name = "ClineFileStorage", options) {
        super();
        this.fsPath = filePath;
        this.name = name;
        this.fileMode = options?.fileMode;
        this.data = this.readFromDisk();
    }
    _get(key) {
        return this.data[key];
    }
    _set(key, value) {
        // Use setBatch for consistency - all writes go through one path
        this.setBatch({ [key]: value });
    }
    _delete(key) {
        this.setBatch({ [key]: undefined });
    }
    /**
     * Set multiple keys in a single write operation.
     * More efficient than calling set() for each key individually,
     * since it only writes to disk once.
     */
    setBatch(entries) {
        const changedKeys = [];
        for (const [key, value] of Object.entries(entries)) {
            if (value === undefined) {
                if (key in this.data) {
                    delete this.data[key];
                    changedKeys.push(key);
                }
            }
            else {
                this.data[key] = value;
                changedKeys.push(key);
            }
        }
        if (changedKeys.length > 0) {
            this.writeToDisk();
            for (const key of changedKeys) {
                this.fireChange(key);
            }
        }
        return Promise.resolve();
    }
    _keys() {
        return Object.keys(this.data);
    }
    readFromDisk() {
        try {
            if (fs.existsSync(this.fsPath)) {
                return JSON.parse(fs.readFileSync(this.fsPath, "utf-8"));
            }
        }
        catch (error) {
            Logger.error(`[${this.name}] failed to read from ${this.fsPath}:`, error);
        }
        return {};
    }
    writeToDisk() {
        try {
            const dir = path.dirname(this.fsPath);
            fs.mkdirSync(dir, { recursive: true });
            atomicWriteFileSync(this.fsPath, JSON.stringify(this.data, null, 2), this.fileMode);
        }
        catch (error) {
            Logger.error(`[${this.name}] failed to write to ${this.fsPath}:`, error);
        }
    }
}
/**
 * Synchronously, atomically write data to a file using temp file + rename pattern.
 * Prefer core/storage's async atomicWriteFile to this.
 */
function atomicWriteFileSync(filePath, data, mode) {
    const tmpPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).substring(7)}.json`;
    try {
        fs.writeFileSync(tmpPath, data, {
            flag: "wx",
            encoding: "utf-8",
            mode,
        });
        // Rename temp file to target (atomic in most cases)
        fs.renameSync(tmpPath, filePath);
    }
    catch (error) {
        // Clean up temp file if it exists
        try {
            fs.unlinkSync(tmpPath);
        }
        catch { }
        throw error;
    }
}
//# sourceMappingURL=ClineFileStorage.js.map