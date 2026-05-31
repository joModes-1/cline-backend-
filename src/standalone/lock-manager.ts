// Stub for lock-manager - backend only
export class LockManager {
  private locks = new Map<string, boolean>()
  
  async acquire(lockId: string): Promise<boolean> {
    if (this.locks.get(lockId)) return false
    this.locks.set(lockId, true)
    return true
  }
  
  async release(lockId: string): Promise<void> {
    this.locks.delete(lockId)
  }

  registerFolderLock(_heldBy: string, _lockTarget: string): Promise<null | any> {
    return Promise.resolve(null)
  }

  releaseFolderLockByTarget(_taskId: string, _lockTarget: string): Promise<void> {
    return Promise.resolve()
  }
}

// Singleton instance
let lockManager: LockManager | undefined

export function getLockManager(): LockManager {
  if (!lockManager) {
    lockManager = new LockManager()
  }
  return lockManager
}
