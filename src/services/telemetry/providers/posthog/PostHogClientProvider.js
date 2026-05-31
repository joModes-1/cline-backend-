import { PostHog } from "posthog-node";
import { ClineEndpoint } from "@/config";
import { fetch } from "@/shared/net";
import { posthogConfig } from "@/shared/services/config/posthog-config";
import { Logger } from "@/shared/services/Logger";
export class PostHogClientProvider {
    static _instance = null;
    static getInstance() {
        if (!PostHogClientProvider._instance) {
            PostHogClientProvider._instance = new PostHogClientProvider();
        }
        return PostHogClientProvider._instance;
    }
    static getClient() {
        return PostHogClientProvider.getInstance().client;
    }
    client;
    constructor() {
        // Skip PostHog client initialization in self-hosted mode
        if (ClineEndpoint.isSelfHosted()) {
            this.client = null;
            return;
        }
        // Initialize PostHog client
        this.client = posthogConfig.apiKey
            ? new PostHog(posthogConfig.apiKey, {
                host: posthogConfig.host,
                fetch: (url, options) => fetch(url, options),
                enableExceptionAutocapture: false, // This is only enabled for error services
                before_send: (event) => PostHogClientProvider.eventFilter(event),
            })
            : null;
        if (this.client) {
            Logger.log("PostHog client initialized");
        }
    }
    /**
     * Filters PostHog events before they are sent.
     * For exceptions, we only capture those from the Cline extension.
     * this is specifically to avoid capturing errors from anything other than Cline
     */
    static eventFilter(event) {
        if (!event || event?.event !== "$exception") {
            return event;
        }
        const exceptionList = event.properties?.["$exception_list"];
        if (!exceptionList?.length) {
            return null;
        }
        // Check if any exception is from Cline
        for (let i = 0; i < exceptionList.length; i++) {
            const stacktrace = exceptionList[i].stacktrace;
            // Fast check: error message contains "cline"
            if (stacktrace?.value?.toLowerCase().includes("cline")) {
                return event;
            }
            const frames = stacktrace?.frames;
            if (frames?.length) {
                for (let j = 0; j < frames.length; j++) {
                    const fileName = frames[j]?.filename;
                    // The extension filename will include "saoudrizwan"
                    // The CLI filename will include "cline"
                    if (fileName?.includes("saoudrizwan") || fileName?.includes("cline")) {
                        return event;
                    }
                }
            }
        }
        return null;
    }
    async dispose() {
        await this.client?.shutdown().catch((error) => Logger.error("Error shutting down PostHog client:", error));
    }
}
//# sourceMappingURL=PostHogClientProvider.js.map