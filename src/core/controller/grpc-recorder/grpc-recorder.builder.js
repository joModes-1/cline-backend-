import { GrpcRecorder, GrpcRecorderNoops } from "@/core/controller/grpc-recorder/grpc-recorder";
import { LogFileHandler, LogFileHandlerNoops } from "@/core/controller/grpc-recorder/log-file-handler";
import { testHooks } from "@/core/controller/grpc-recorder/test-hooks";
/**
 * A builder class for constructing a gRPC recorder instance.
 *
 * This class follows the Builder pattern, allowing consumers
 * to configure logging behavior and control whether recording
 * is enabled or disabled before creating a final `IRecorder`.
 */
export class GrpcRecorderBuilder {
    fileHandler = null;
    enabled = true;
    filters = [];
    hooks = [];
    withLogFileHandler(handler) {
        this.fileHandler = handler;
        return this;
    }
    enableIf(condition) {
        this.enabled = condition;
        return this;
    }
    withFilters(...filters) {
        this.filters.push(...filters);
        return this;
    }
    withPostRecordHooks(...hooks) {
        this.hooks.push(...hooks);
        return this;
    }
    // Initialize the recorder as a singleton
    static recorder;
    /**
     * Gets or creates the GrpcRecorder instance
     */
    static getRecorder(controller) {
        if (!GrpcRecorderBuilder.recorder) {
            GrpcRecorderBuilder.recorder = GrpcRecorder.builder()
                .enableIf(process.env.GRPC_RECORDER_ENABLED === "true" && process.env.CLINE_ENVIRONMENT === "local")
                .withLogFileHandler(new LogFileHandler())
                .build(controller);
        }
        return GrpcRecorderBuilder.recorder;
    }
    build(controller) {
        if (!this.enabled) {
            return new GrpcRecorderNoops();
        }
        let filters = filtersFromEnv();
        if (this.filters.length > 0) {
            filters = filters.concat(this.filters);
        }
        let hooks = hooksFromEnv(controller);
        if (this.hooks.length > 0) {
            hooks = hooks.concat(this.hooks);
        }
        const handler = this.fileHandler ?? new LogFileHandlerNoops();
        return new GrpcRecorder(handler, filters, hooks);
    }
}
function filtersFromEnv() {
    const filters = [];
    if (process.env.GRPC_RECORDER_TESTS_FILTERS_ENABLED === "true") {
        filters.push(...testFilters());
    }
    return filters;
}
function testFilters() {
    /*
     * Ignores streaming messages and unwanted services messages
     * that record more than expected.
     */
    return [
        (req) => req.is_streaming,
        (req) => ["cline.UiService", "cline.McpService", "cline.WebService"].includes(req.service),
        (req) => [
            "refreshOpenRouterModels",
            "getAvailableTerminalProfiles",
            "showTaskWithId",
            "deleteTasksWithIds",
            "getTotalTasksSize",
            "cancelTask",
        ].includes(req.method),
    ];
}
function hooksFromEnv(controller) {
    const hooks = [];
    if (controller && process.env.GRPC_RECORDER_TESTS_FILTERS_ENABLED === "true") {
        hooks.push(...testHooks(controller));
    }
    return hooks;
}
//# sourceMappingURL=grpc-recorder.builder.js.map