import { StringArray } from "@shared/proto/cline/common";
import axios from "axios";
import { getAxiosSettings } from "@/shared/net";
import { Logger } from "@/shared/services/Logger";
/**
 * Fetches available models from the OpenAI API
 * @param controller The controller instance
 * @param request Request containing the base URL and API key
 * @returns Array of model names
 */
export async function refreshOpenAiModels(_controller, request) {
    try {
        if (!request.baseUrl) {
            return StringArray.create({ values: [] });
        }
        if (!URL.canParse(request.baseUrl)) {
            return StringArray.create({ values: [] });
        }
        const config = {};
        if (request.apiKey) {
            config["headers"] = { Authorization: `Bearer ${request.apiKey}` };
        }
        const response = await axios.get(`${request.baseUrl}/models`, { ...config, ...getAxiosSettings() });
        const modelsArray = response.data?.data?.map((model) => model.id) || [];
        const models = [...new Set(modelsArray)];
        return StringArray.create({ values: models });
    }
    catch (error) {
        Logger.error("Error fetching OpenAI models:", error);
        return StringArray.create({ values: [] });
    }
}
//# sourceMappingURL=refreshOpenAiModels.js.map