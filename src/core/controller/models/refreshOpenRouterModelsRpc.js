import { OpenRouterCompatibleModelInfo } from "@shared/proto/cline/models";
import { toProtobufModels } from "../../../shared/proto-conversions/models/typeConversion";
import { refreshOpenRouterModels } from "./refreshOpenRouterModels";
/**
 * Refreshes OpenRouter models and returns protobuf types for gRPC
 * @param controller The controller instance
 * @param request Empty request (unused but required for gRPC signature)
 * @returns OpenRouterCompatibleModelInfo with protobuf types
 */
export async function refreshOpenRouterModelsRpc(controller, _request) {
    const models = await refreshOpenRouterModels(controller);
    return OpenRouterCompatibleModelInfo.create({
        models: toProtobufModels(models),
    });
}
//# sourceMappingURL=refreshOpenRouterModelsRpc.js.map