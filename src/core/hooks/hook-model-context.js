import { getProviderModelIdKey } from "@shared/storage/provider-keys";
/**
 * Resolve the active provider/model pair used for hook payload metadata.
 */
export function getHookModelContext(api, stateManager) {
    const mode = stateManager.getGlobalSettingsKey("mode");
    const resolvedMode = mode === "plan" ? "plan" : "act";
    const apiConfig = stateManager.getApiConfiguration();
    // `api` is expected to represent the handler for the currently resolved mode.
    // We still resolve provider/model from state config for deterministic hook metadata,
    // then fall back to the active handler model id if config is unavailable.
    const provider = (resolvedMode === "plan" ? apiConfig.planModeApiProvider : apiConfig.actModeApiProvider);
    const genericModelKey = `${resolvedMode}ModeApiModelId`;
    const providerModelKey = provider ? getProviderModelIdKey(provider, resolvedMode) : undefined;
    const configRecord = apiConfig;
    const providerModelSlug = providerModelKey ? configRecord[providerModelKey] : undefined;
    // Only read the generic fallback key when it differs from the provider key.
    // Some providers (e.g. anthropic/gemini/bedrock) intentionally map directly to the generic key,
    // so a second lookup would be redundant and add noise to fallback semantics.
    const genericModelSlug = providerModelKey !== genericModelKey ? configRecord[genericModelKey] : undefined;
    const activeHandlerModelSlug = api.getModel().id;
    const slug = providerModelSlug || genericModelSlug || activeHandlerModelSlug;
    return {
        provider: provider || "unknown",
        slug: slug || "unknown",
    };
}
//# sourceMappingURL=hook-model-context.js.map