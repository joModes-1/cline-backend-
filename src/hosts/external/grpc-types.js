import { createChannel } from "nice-grpc";
/**
 * Abstract base class for type-safe gRPC client implementations.
 *
 * Provides automatic connection management with lazy initialization and
 * transparent reconnection on network failures. Ensures type safety through
 * generic client typing and consistent error handling patterns.
 *
 * @template TClient - The specific gRPC client type (e.g., niceGrpc.host.DiffServiceClient)
 */
export class BaseGrpcClient {
    client = null;
    channel = null;
    address;
    constructor(address) {
        this.address = address;
    }
    getClient() {
        if (!this.client || !this.channel) {
            const channelOptions = { "grpc.enable_http_proxy": 0 };
            this.channel = createChannel(this.address, undefined, channelOptions);
            this.client = this.createClient(this.channel);
        }
        return this.client;
    }
    destroyClient() {
        this.channel?.close();
        this.client = null;
        this.channel = null;
    }
    async makeRequest(requestFn) {
        const client = this.getClient();
        try {
            return await requestFn(client);
        }
        catch (error) {
            if (error?.code === "UNAVAILABLE") {
                this.destroyClient();
            }
            throw error;
        }
    }
}
//# sourceMappingURL=grpc-types.js.map