import { Logger } from "@/shared/services/Logger";
import { createAnthropicVariant, createGemini3Variant, createGeminiVariant, createGenericVariant, createGPT51Variant, } from "./variants";
/**
 * Singleton registry for managing deep-planning prompt variants
 * Selects appropriate variant based on model family detection
 */
class DeepPlanningRegistry {
    static instance = null;
    variants = new Map();
    genericVariant;
    constructor() {
        // Initialize all variants
        this.registerVariant(createAnthropicVariant());
        this.registerVariant(createGeminiVariant());
        this.registerVariant(createGemini3Variant());
        this.registerVariant(createGPT51Variant());
        // Generic variant must be registered last as fallback
        const genericVariant = createGenericVariant();
        this.registerVariant(genericVariant);
        this.genericVariant = genericVariant;
    }
    /**
     * Get the singleton instance of the registry
     */
    static getInstance() {
        if (!DeepPlanningRegistry.instance) {
            DeepPlanningRegistry.instance = new DeepPlanningRegistry();
        }
        return DeepPlanningRegistry.instance;
    }
    /**
     * Register a new variant in the registry
     */
    register(variant) {
        this.registerVariant(variant);
    }
    /**
     * Internal method to register a variant
     */
    registerVariant(variant) {
        this.variants.set(variant.id, variant);
    }
    /**
     * Get the appropriate variant based on the system prompt context
     * Uses matcher functions to determine which variant to use
     * Falls back to generic variant if no match or on error
     */
    get(context) {
        try {
            // Try each variant's matcher function (except generic which is last)
            for (const variant of this.variants.values()) {
                // Skip generic variant in iteration (it's the fallback)
                if (variant.id === "generic") {
                    continue;
                }
                // Test if this variant matches the context
                if (variant.matcher(context)) {
                    return variant;
                }
            }
            // No match found, return generic variant
            return this.genericVariant;
        }
        catch (error) {
            // On any error, safely fall back to generic variant
            Logger.warn("Error selecting deep-planning variant, falling back to generic:", error);
            return this.genericVariant;
        }
    }
    /**
     * Get all registered variants
     */
    getAll() {
        return Array.from(this.variants.values());
    }
}
/**
 * Export singleton instance getter
 */
export function getDeepPlanningRegistry() {
    return DeepPlanningRegistry.getInstance();
}
//# sourceMappingURL=registry.js.map