import { serviceHandlers } from "@generated/hosts/vscode/protobus-services";
import { GrpcRecorderBuilder } from "@/core/controller/grpc-recorder/grpc-recorder.builder";
import { GrpcRequestRegistry } from "@/core/controller/grpc-request-registry";
import { Logger } from "@/shared/services/Logger";
/**
 * Creates a middleware wrapper for recording gRPC requests and responses
 */
function withRecordingMiddleware(postMessage, controller) {
    return async (response) => {
        if (response?.grpc_response) {
            try {
                GrpcRecorderBuilder.getRecorder(controller).recordResponse(response.grpc_response.request_id, response.grpc_response);
            }
            catch (e) {
                Logger.warn("Failed to record gRPC response:", e);
            }
        }
        return postMessage(response);
    };
}
/**
 * Records gRPC request with error handling
 */
function recordRequest(request, controller) {
    try {
        GrpcRecorderBuilder.getRecorder(controller).recordRequest(request);
    }
    catch (e) {
        Logger.warn("Failed to record gRPC request:", e);
    }
}
/**
 * Handles a gRPC request from the webview.
 */
export async function handleGrpcRequest(controller, postMessageToWebview, request) {
    recordRequest(request, controller);
    // Create recording middleware wrapper
    const postMessageWithRecording = withRecordingMiddleware(postMessageToWebview, controller);
    if (request.is_streaming) {
        await handleStreamingRequest(controller, postMessageWithRecording, request);
    }
    else {
        await handleUnaryRequest(controller, postMessageWithRecording, request);
    }
}
/**
 * Handles a gRPC unary request from the webview.
 *
 * Calls the handler using the service and method name, and then posts the result back to the webview.
 */
async function handleUnaryRequest(controller, postMessageToWebview, request) {
    try {
        // Get the service handler from the config
        const handler = getHandler(request.service, request.method);
        // Handle unary request
        const response = await handler(controller, request.message);
        // Send response to the webview
        await postMessageToWebview({
            type: "grpc_response",
            grpc_response: {
                message: response,
                request_id: request.request_id,
            },
        });
    }
    catch (error) {
        // Send error response
        Logger.log("Protobus error:", error);
        await postMessageToWebview({
            type: "grpc_response",
            grpc_response: {
                error: error instanceof Error ? error.message : String(error),
                request_id: request.request_id,
                is_streaming: false,
            },
        });
    }
}
/**
 * Handle a streaming gRPC request from the webview.
 *
 * Calls the handler using the service and method name, and creates a streaming response handler
 * which posts results back to the webview.
 */
async function handleStreamingRequest(controller, postMessageToWebview, request) {
    // Create a response stream function
    const responseStream = async (response, isLast = false, sequenceNumber) => {
        await postMessageToWebview({
            type: "grpc_response",
            grpc_response: {
                message: response,
                request_id: request.request_id,
                is_streaming: !isLast,
                sequence_number: sequenceNumber,
            },
        });
    };
    try {
        // Get the service handler from the config
        const handler = getHandler(request.service, request.method);
        // Handle streaming request and pass the requestId to all streaming handlers
        await handler(controller, request.message, responseStream, request.request_id);
        // Don't send a final message here - the stream should stay open for future updates
        // The stream will be closed when the client disconnects or when the service explicitly ends it
    }
    catch (error) {
        // Send error response
        Logger.log("Protobus error:", error);
        await postMessageToWebview({
            type: "grpc_response",
            grpc_response: {
                error: error instanceof Error ? error.message : String(error),
                request_id: request.request_id,
                is_streaming: false,
            },
        });
    }
}
/**
 * Handles a gRPC request cancellation from the webview.
 * @param controller The controller instance
 * @param request The cancellation request
 */
export async function handleGrpcRequestCancel(postMessageToWebview, request) {
    const cancelled = requestRegistry.cancelRequest(request.request_id);
    if (cancelled) {
        // Send a cancellation confirmation
        await postMessageToWebview({
            type: "grpc_response",
            grpc_response: {
                message: { cancelled: true },
                request_id: request.request_id,
                is_streaming: false,
            },
        });
    }
    else {
        Logger.log(`[DEBUG] Request not found for cancellation: ${request.request_id}`);
    }
}
// Registry to track active gRPC requests and their cleanup functions
const requestRegistry = new GrpcRequestRegistry();
/**
 * Get the request registry instance
 * This allows other parts of the code to access the registry
 */
export function getRequestRegistry() {
    return requestRegistry;
}
function getHandler(serviceName, methodName) {
    // Get the service handler from the config
    const serviceConfig = serviceHandlers[serviceName];
    if (!serviceConfig) {
        throw new Error(`Unknown service: ${serviceName}`);
    }
    const handler = serviceConfig[methodName];
    if (!handler) {
        throw new Error(`Unknown rpc: ${serviceName}.${methodName}`);
    }
    return handler;
}
//# sourceMappingURL=grpc-handler.js.map