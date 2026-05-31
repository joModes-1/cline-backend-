// Stub for lock-manager - backend only
export class LockManager {
    locks = new Map();
    async acquire(lockId) {
        if (this.locks.get(lockId))
            return false;
        this.locks.set(lockId, true);
        return true;
    }
    async release(lockId) {
        this.locks.delete(lockId);
    }
    registerFolderLock(_heldBy, _lockTarget) {
        return Promise.resolve(null);
    }
    releaseFolderLockByTarget(_taskId, _lockTarget) {
        return Promise.resolve();
    }
}
// Singleton instance
let lockManager;
export function getLockManager() {
    if (!lockManager) {
        lockManager = new LockManager();
    }
    return lockManager;
}
//# sourceMappingURL=lock-manager.js.map