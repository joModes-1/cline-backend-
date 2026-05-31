// Stub for standalone utils - backend only version
export function asyncIteratorToCallbacks<T>(stream: AsyncIterable<T>, callbacks: any): void {
  const run = async () => {
    try {
      for await (const item of stream) {
        callbacks.onMessage?.(item)
      }
      callbacks.onComplete?.()
    } catch (error) {
      callbacks.onError?.(error)
    }
  }
  run()
}
