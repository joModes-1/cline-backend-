import { GrpcRecorderBuilder } from "@/core/controller/grpc-recorder/grpc-recorder.builder";
import { Logger } from "@/shared/services/Logger";
export class GrpcRecorderNoops {
    recordRequest(_request) { }
    recordResponse(_requestId, _response) { }
    recordError(_requestId, _error) { }
    getSessionLog() {
        return {
            startTime: "",
            entries: [],
        };
    }
    cleanupSyntheticEntries() { }
}
/**
 * Default implementation of a gRPC recorder.
 *
 * Responsibilities:
 * - Records requests, responses, and errors.
 * - Tracks request/response lifecycle, including duration and status.
 * - Maintains a session log of all recorded entries.
 * - Persists logs asynchronously through a file handler.
 */
export class GrpcRecorder {
    fileHandler;
    requestFilters;
    postRecordHooks;
    sessionLog;
    pendingRequests = new Map();
    constructor(fileHandler, requestFilters = [], postRecordHooks = []) {
        this.fileHandler = fileHandler;
        this.requestFilters = requestFilters;
        this.postRecordHooks = postRecordHooks;
        this.sessionLog = {
            startTime: new Date().toISOString(),
            entries: [],
        };
        this.fileHandler.initialize(this.sessionLog).catch((error) => {
            Logger.error("Failed to initialize gRPC log file:", error);
        });
    }
    static builder() {
        return new GrpcRecorderBuilder();
    }
    /**
     * Records a gRPC request.
     *
     * - Stores the request as a "pending" log entry.
     * - Tracks the request start time for later duration calculation.
     * - Persists the log asynchronously.
     *
     * @param request - The incoming gRPC request.
     */
    recordRequest(request, synthetic = false) {
        if (this.shouldFilter(request)) {
            return;
        }
        const entry = {
            requestId: request.request_id,
            service: request.service,
            method: request.method,
            isStreaming: request.is_streaming || false,
            request: {
                message: request.message,
            },
            status: "pending",
            meta: { synthetic },
        };
        this.pendingRequests.set(request.request_id, {
            entry,
            startTime: Date.now(),
        });
        this.sessionLog.entries.push(entry);
        this.flushLogAsync();
    }
    getSessionLog() {
        return this.sessionLog;
    }
    /**
     * Records a gRPC response for a given request.
     *
     * - Looks up the pending request entry.
     * - Updates the entry with response data, status, and duration.
     * - Removes the request from pending if it's not streaming.
     * - Recomputes session stats.
     * - Persists the log asynchronously.
     *
     * @param requestId - The ID of the request being responded to.
     * @param response - The corresponding gRPC response.
     */
    recordResponse(requestId, response) {
        const pendingRequest = this.pendingRequests.get(requestId);
        if (!pendingRequest) {
            Logger.warn(`No pending request found for response with ID: ${requestId}`);
            return;
        }
        const { entry, startTime } = pendingRequest;
        entry.response = {
            message: response?.message ? response.message : undefined,
            error: response?.error,
            isStreaming: response?.is_streaming,
            sequenceNumber: response?.sequence_number,
        };
        entry.duration = Date.now() - startTime;
        entry.status = response?.error ? "error" : "completed";
        if (!response?.is_streaming) {
            this.pendingRequests.delete(requestId);
        }
        this.sessionLog.stats = this.getStats();
        this.flushLogAsync();
        this.runHooks(entry).catch((e) => Logger.error("Post-record hook failed:", e));
    }
    async runHooks(entry) {
        if (entry.meta?.synthetic)
            return;
        for (const hook of this.postRecordHooks) {
            await hook(entry);
        }
    }
    cleanupSyntheticEntries() {
        // Remove synthetic entries from session log
        this.sessionLog.entries = this.sessionLog.entries.filter((entry) => !entry.meta?.synthetic);
        // clean up from pending requests if needed
        for (const [requestId, pendingRequest] of this.pendingRequests.entries()) {
            if (pendingRequest.entry.meta?.synthetic) {
                this.pendingRequests.delete(requestId);
            }
        }
        this.sessionLog.stats = this.getStats();
        this.flushLogAsync();
    }
    /**
     * Records an error for a given request.
     *
     * - Marks the request as failed.
     * - Records the error message and request duration.
     * - Removes it from the pending requests.
     * - Persists the log asynchronously.
     *
     * @param requestId - The ID of the request that errored.
     * @param error - Error message.
     */
    recordError(requestId, error) {
        const pendingRequest = this.pendingRequests.get(requestId);
        if (!pendingRequest) {
            Logger.warn(`No pending request found for error with ID: ${requestId}`);
            return;
        }
        const { entry, startTime } = pendingRequest;
        entry.response = {
            error: error,
        };
        entry.duration = Date.now() - startTime;
        entry.status = "error";
        this.pendingRequests.delete(requestId);
        this.flushLogAsync();
    }
    flushLogAsync() {
        setImmediate(() => {
            this.fileHandler.write(this.sessionLog).catch((error) => {
                Logger.error("Failed to flush gRPC log:", error);
            });
        });
    }
    getStats() {
        const totalRequests = this.sessionLog.entries.length;
        const pendingRequests = this.sessionLog.entries.filter((e) => e.status === "pending").length;
        const completedRequests = this.sessionLog.entries.filter((e) => e.status === "completed").length;
        const errorRequests = this.sessionLog.entries.filter((e) => e.status === "error").length;
        return {
            totalRequests,
            pendingRequests,
            completedRequests,
            errorRequests,
        };
    }
    shouldFilter(request) {
        return this.requestFilters.some((filter) => filter(request));
    }
}
//# sourceMappingURL=grpc-recorder.js.map