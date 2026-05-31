import { OpenRouterCompatibleModelInfo } from "@shared/proto/cline/models";
import { toProtobufModels } from "../../../shared/proto-conversions/models/typeConversion";
import { refreshClineModels } from "./refreshClineModels";
/**
 * Refreshes Cline models and returns protobuf types for gRPC
 * @param controller The controller instance
 * @param request Empty request (unused but required for gRPC signature)
 * @returns OpenRouterCompatibleModelInfo with protobuf types (reusing the same proto type)
 */
export async function refreshClineModelsRpc(controller, _request) {
    const models = await refreshClineModels(controller);
    return OpenRouterCompatibleModelInfo.create({
        models: toProtobufModels(models),
    });
}
//# sourceMappingURL=refreshClineModelsRpc.js.map