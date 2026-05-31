import { VsCodeLmModelsArray } from "@shared/proto/cline/models";
import { Logger } from "@/shared/services/Logger";
import { convertVsCodeNativeModelsToProtoModels } from "../../../shared/proto-conversions/models/vscode-lm-models-conversion";
/**
 * Fetches available models from VS Code LM API
 * @param controller The controller instance
 * @param request Empty request
 * @returns Array of VS Code LM models
 */
export async function getVsCodeLmModels(_controller, _request) {
    try {
        let vscode;
        try {
            vscode = await import("vscode");
        }
        catch {
            return VsCodeLmModelsArray.create({ models: [] });
        }
        const models = await vscode.lm.selectChatModels({});
        const protoModels = convertVsCodeNativeModelsToProtoModels(models || []);
        return VsCodeLmModelsArray.create({ models: protoModels });
    }
    catch (error) {
        Logger.error("Error fetching VS Code LM models:", error);
        return VsCodeLmModelsArray.create({ models: [] });
    }
}
//# sourceMappingURL=getVsCodeLmModels.js.map