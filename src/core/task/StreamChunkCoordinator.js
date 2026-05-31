import { Logger } from "@/shared/services/Logger";
export class StreamChunkCoordinator {
    options;
    iterator;
    queue = [];
    readError;
    completed = false;
    stopRequested = false;
    waiterResolve;
    pumpPromise;
    constructor(stream, options) {
        this.options = options;
        this.iterator = stream[Symbol.asyncIterator]();
        this.pumpPromise = this.startPump();
    }
    notifyWaiter() {
        if (this.waiterResolve) {
            this.waiterResolve();
            this.waiterResolve = undefined;
        }
    }
    async waitForData() {
        if (this.queue.length > 0 || this.completed || this.readError) {
            return;
        }
        await new Promise((resolve) => {
            this.waiterResolve = resolve;
        });
    }
    async closeIterator() {
        if (typeof this.iterator.return !== "function") {
            return;
        }
        try {
            await this.iterator.return(undefined);
        }
        catch (error) {
            Logger.debug(`[StreamChunkCoordinator] Failed to close stream iterator: ${error}`);
        }
    }
    startPump() {
        return (async () => {
            try {
                while (!this.stopRequested) {
                    const { value: chunk, done } = await this.iterator.next();
                    if (done || !chunk) {
                        break;
                    }
                    if (chunk.type === "usage") {
                        this.options.onUsageChunk(chunk);
                        continue;
                    }
                    this.queue.push(chunk);
                    this.notifyWaiter();
                }
            }
            catch (error) {
                this.readError = error;
            }
            finally {
                this.completed = true;
                this.notifyWaiter();
            }
        })();
    }
    async nextChunk() {
        while (true) {
            if (this.readError) {
                throw this.readError;
            }
            const chunk = this.queue.shift();
            if (chunk) {
                return chunk;
            }
            if (this.completed) {
                return undefined;
            }
            await this.waitForData();
        }
    }
    async stop() {
        this.stopRequested = true;
        await this.closeIterator();
        await this.pumpPromise.catch(() => { });
    }
    async waitForCompletion() {
        await this.pumpPromise;
        if (this.readError) {
            throw this.readError;
        }
    }
}
//# sourceMappingURL=StreamChunkCoordinator.js.map