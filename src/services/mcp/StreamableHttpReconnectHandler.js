import { Logger } from "@/shared/services/Logger";
/** Default configuration: up to 6 attempts with exponential backoff starting at 2 s. */
export const DEFAULT_RECONNECT_CONFIG = {
    maxAttempts: 6,
    getDelayMs: (attempt) => 2000 * 2 ** attempt,
};
/**
 * Manages reconnection logic for a single StreamableHTTP MCP transport.
 *
 * Each instance tracks its own attempt counter. When the transport's `onerror`
 * fires, call {@link handleError}. The handler will:
 *
 * 1. Skip if the connection is disabled or already reconnecting.
 * 2. Wait with exponential backoff.
 * 3. Tear down and re-establish the connection.
 * 4. Reset the counter on success.
 * 5. After exhausting retries, mark the server as disconnected.
 */
export class StreamableHttpReconnectHandler {
    attempts = 0;
    serverName;
    config;
    callbacks;
    constructor(serverName, callbacks, config = DEFAULT_RECONNECT_CONFIG) {
        this.serverName = serverName;
        this.callbacks = callbacks;
        this.config = config;
    }
    /** Number of consecutive reconnect attempts so far */
    get attemptCount() {
        return this.attempts;
    }
    /** Reset the attempt counter (e.g. after a successful long-lived connection) */
    resetAttempts() {
        this.attempts = 0;
    }
    /**
     * Handle a transport error. Call this from `transport.onerror`.
     */
    async handleError(error) {
        Logger.error(`Transport error for "${this.serverName}":`, error);
        const connection = this.callbacks.findConnection();
        if (!connection) {
            return;
        }
        // Don't retry if intentionally disabled or already mid-reconnect
        if (connection.server.disabled || connection.server.status === "connecting") {
            return;
        }
        if (this.attempts >= this.config.maxAttempts) {
            // Max retries exhausted
            Logger.error(`StreamableHTTP max reconnect attempts (${this.config.maxAttempts}) ` +
                `exhausted for "${this.serverName}". Server marked as disconnected.`);
            connection.server.status = "disconnected";
            this.callbacks.deleteServerKey(connection.server.uid || this.serverName);
            this.callbacks.appendErrorMessage(connection, error instanceof Error ? error.message : `${error}`);
            await this.callbacks.notifyWebviewOfServerChanges();
            return;
        }
        // First attempt: backoff, verify staleness, then delete + connect.
        // Subsequent attempts (on connectToServer failure) just backoff + connect.
        const initialDelay = this.config.getDelayMs(this.attempts);
        this.attempts++;
        Logger.log(`StreamableHTTP transport error for "${this.serverName}", attempting reconnect ` +
            `${this.attempts}/${this.config.maxAttempts} in ${initialDelay / 1000}s...`);
        connection.server.status = "connecting";
        await this.callbacks.notifyWebviewOfServerChanges();
        await this.callbacks.delay(initialDelay);
        // Verify connection still exists and hasn't been replaced during the delay
        const currentConnection = this.callbacks.findConnection();
        if (!currentConnection || currentConnection !== connection) {
            return;
        }
        // Tear down the old connection, then retry connectToServer in a loop.
        // We loop here instead of relying on the new transport's onerror because
        // connectToServer() may throw before a new transport/error-handler is
        // established, which would silently break the retry chain.
        await this.callbacks.deleteConnection();
        while (this.attempts <= this.config.maxAttempts) {
            try {
                await this.callbacks.connectToServer();
                Logger.log(`StreamableHTTP reconnect succeeded for "${this.serverName}"`);
                this.attempts = 0;
                return;
            }
            catch (reconnectError) {
                Logger.error(`StreamableHTTP reconnect failed for "${this.serverName}":`, reconnectError);
                if (this.attempts < this.config.maxAttempts) {
                    const retryDelay = this.config.getDelayMs(this.attempts);
                    this.attempts++;
                    Logger.log(`StreamableHTTP retrying reconnect ${this.attempts}/${this.config.maxAttempts} ` +
                        `for "${this.serverName}" in ${retryDelay / 1000}s...`);
                    await this.callbacks.delay(retryDelay);
                }
                else {
                    break;
                }
            }
        }
        // All retry attempts exhausted during the connect loop.
        Logger.error(`StreamableHTTP max reconnect attempts (${this.config.maxAttempts}) ` +
            `exhausted for "${this.serverName}". Server marked as disconnected.`);
        // The old connection was deleted; check if connectToServer left a partial one.
        const exhaustedConnection = this.callbacks.findConnection();
        if (exhaustedConnection) {
            exhaustedConnection.server.status = "disconnected";
            this.callbacks.deleteServerKey(exhaustedConnection.server.uid || this.serverName);
            this.callbacks.appendErrorMessage(exhaustedConnection, error instanceof Error ? error.message : `${error}`);
        }
        await this.callbacks.notifyWebviewOfServerChanges();
    }
}
//# sourceMappingURL=StreamableHttpReconnectHandler.js.map