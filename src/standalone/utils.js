// Stub for standalone utils - backend only version
export function asyncIteratorToCallbacks(stream, callbacks) {
    const run = async () => {
        try {
            for await (const item of stream) {
                callbacks.onMessage?.(item);
            }
            callbacks.onComplete?.();
        }
        catch (error) {
            callbacks.onError?.(error);
        }
    };
    run();
}
//# sourceMappingURL=utils.js.map