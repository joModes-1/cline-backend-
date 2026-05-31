/**
 * Minimal stub for host-provider-types - Backend only version
 */

export interface HostBridgeClientProvider {
  workspaceClient: any
  envClient: any
  windowClient: any
  diffClient: any
}

export interface StreamingCallbacks<T = any> {
  onMessage: (message: T) => void
  onError: (error: any) => void
  onComplete: () => void
}
