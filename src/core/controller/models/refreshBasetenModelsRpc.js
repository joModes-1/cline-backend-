import { OpenRouterCompatibleModelInfo } from "@shared/proto/cline/models";
import { toProtobufModels } from "../../../shared/proto-conversions/models/typeConversion";
import { refreshBasetenModels } from "./refreshBasetenModels";
/**
 * Handles protobuf conversion for gRPC service
 * @param controller The controller instance
 * @param request Empty request object
 * @returns Response containing Baseten models (protobuf types)
 */
export async function refreshBasetenModelsRpc(controller, _request) {
    const models = await refreshBasetenModels(controller);
    return OpenRouterCompatibleModelInfo.create({ models: toProtobufModels(models) });
}
//# sourceMappingURL=refreshBasetenModelsRpc.js.map