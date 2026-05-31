import { OpenRouterCompatibleModelInfo } from "@shared/proto/cline/models";
import { toProtobufModels } from "../../../shared/proto-conversions/models/typeConversion";
import { refreshLiteLlmModels } from "./refreshLiteLlmModels";
/**
 * Refreshes LiteLLM models and returns protobuf types for gRPC
 * @param controller The controller instance
 * @param request Empty request (unused but required for gRPC signature)
 * @returns OpenRouterCompatibleModelInfo with protobuf types
 */
export async function refreshLiteLlmModelsRpc(_controller, _request) {
    const models = await refreshLiteLlmModels();
    return OpenRouterCompatibleModelInfo.create({
        models: toProtobufModels(models),
    });
}
//# sourceMappingURL=refreshLiteLlmModelsRpc.js.map