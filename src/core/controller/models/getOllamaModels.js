import { StringArray } from "@shared/proto/cline/common";
import axios from "axios";
import { getAxiosSettings } from "@/shared/net";
/**
 * Fetches available models from Ollama
 * @param controller The controller instance
 * @param request The request containing the base URL (optional)
 * @returns Array of model names
 */
export async function getOllamaModels(_controller, request) {
    try {
        const baseUrl = request.value || "http://localhost:11434";
        if (!URL.canParse(baseUrl)) {
            return StringArray.create({ values: [] });
        }
        const response = await axios.get(`${baseUrl}/api/tags`, getAxiosSettings());
        const modelsArray = response.data?.models?.map((model) => model.name) || [];
        const models = [...new Set(modelsArray)].sort();
        return StringArray.create({ values: models });
    }
    catch (_error) {
        return StringArray.create({ values: [] });
    }
}
//# sourceMappingURL=getOllamaModels.js.map