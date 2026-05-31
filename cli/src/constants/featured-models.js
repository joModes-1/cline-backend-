/**
 * Featured models shown in the Cline model picker during onboarding
 * These are curated models that work well with Cline
 */
import { CLINE_RECOMMENDED_MODELS_FALLBACK } from "@shared/cline/recommended-models";
function toFeaturedModel(model) {
    return {
        id: model.id,
        name: model.name,
        description: model.description,
        labels: model.tags,
    };
}
function getModelIdSuffix(id) {
    const lastSlashIndex = id.lastIndexOf("/");
    return lastSlashIndex >= 0 ? id.slice(lastSlashIndex + 1) : id;
}
function findFallbackFeaturedModelById(models, id) {
    const idSuffix = getModelIdSuffix(id);
    return models.find((model) => model.id === id || getModelIdSuffix(model.id) === idSuffix);
}
function mapRecommendedModelToFeaturedModelWithFallback(model, fallbackModels, defaultLabels = []) {
    const fallbackModel = findFallbackFeaturedModelById(fallbackModels, model.id);
    const upstreamNameLooksLikeFallback = model.name === model.id || model.name.trim().length === 0;
    const name = upstreamNameLooksLikeFallback ? (fallbackModel?.name ?? model.name) : model.name;
    const description = model.description.trim().length > 0 ? model.description : (fallbackModel?.description ?? "");
    const labels = model.tags.length > 0 ? model.tags : (fallbackModel?.labels ?? defaultLabels);
    return {
        id: model.id,
        name,
        description,
        labels,
    };
}
export const FEATURED_MODELS = {
    recommended: CLINE_RECOMMENDED_MODELS_FALLBACK.recommended.map(toFeaturedModel),
    free: CLINE_RECOMMENDED_MODELS_FALLBACK.free.map(toFeaturedModel),
};
export function getAllFeaturedModels(modelsByTier = FEATURED_MODELS) {
    return [...modelsByTier.recommended, ...modelsByTier.free];
}
export function mapRecommendedModelsToFeaturedModels(data) {
    return {
        recommended: data.recommended.map((model) => mapRecommendedModelToFeaturedModelWithFallback(model, FEATURED_MODELS.recommended)),
        free: data.free.map((model) => mapRecommendedModelToFeaturedModelWithFallback(model, FEATURED_MODELS.free, ["FREE"])),
    };
}
export function withFeaturedModelFallback(modelsByTier) {
    const recommended = modelsByTier.recommended.length > 0 ? modelsByTier.recommended : FEATURED_MODELS.recommended;
    const free = modelsByTier.free.length > 0 ? modelsByTier.free : FEATURED_MODELS.free;
    return { recommended, free };
}
//# sourceMappingURL=featured-models.js.map