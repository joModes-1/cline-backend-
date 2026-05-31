/**
 * Type-safe builder for creating prompt variants
 * Provides compile-time validation and IntelliSense support
 */
export class VariantBuilder {
    variant = {};
    constructor(family) {
        // Initialize with clean state
        this.variant = {
            ...this.variant,
            family: family,
            version: 1,
            tags: [],
            labels: {},
            config: {},
            componentOverrides: {},
            placeholders: {},
            toolOverrides: {},
        };
    }
    /**
     * Set the variant description
     */
    description(desc) {
        this.variant = {
            ...this.variant,
            description: desc,
        };
        return this;
    }
    /**
     * Set the version number
     */
    version(version) {
        this.variant = {
            ...this.variant,
            version: version,
        };
        return this;
    }
    /**
     * Add tags to the variant
     */
    tags(...tags) {
        this.variant = {
            ...this.variant,
            tags: [...(this.variant.tags || []), ...tags],
        };
        return this;
    }
    /**
     * Set labels with version mapping
     * e.g., use_native_tools: 1 to indicate support for native tools
     */
    labels(labels) {
        this.variant = {
            ...this.variant,
            labels: { ...this.variant.labels, ...labels },
        };
        return this;
    }
    /**
     * Set the matcher function to determine if this variant should be used for the given context
     */
    matcher(matcherFn) {
        this.variant = {
            ...this.variant,
            matcher: matcherFn,
        };
        return this;
    }
    /**
     * Set the base template (optional)
     * If not provided, will be auto-generated from componentOrder
     */
    template(baseTemplate) {
        this.variant = {
            ...this.variant,
            baseTemplate: baseTemplate,
        };
        return this;
    }
    /**
     * Configure component order with type safety
     */
    components(...sections) {
        this.variant = {
            ...this.variant,
            componentOrder: sections,
        };
        return this;
    }
    /**
     * Override specific components with type safety
     */
    overrideComponent(section, override) {
        const current = this.variant.componentOverrides || {};
        this.variant = {
            ...this.variant,
            componentOverrides: { ...current, [section]: override },
        };
        return this;
    }
    /**
     * Configure tools with type safety
     * If a tool is listed here but no variant was registered, it will fall back to the generic variant.
     */
    tools(...tools) {
        this.variant = {
            ...this.variant,
            tools: tools,
        };
        return this;
    }
    /**
     * Override specific tools with type safety
     */
    overrideTool(tool, override) {
        const current = this.variant.toolOverrides || {};
        this.variant = {
            ...this.variant,
            toolOverrides: { ...current, [tool]: override },
        };
        return this;
    }
    /**
     * Set placeholder values
     */
    placeholders(placeholders) {
        this.variant = {
            ...this.variant,
            placeholders: { ...this.variant.placeholders, ...placeholders },
        };
        return this;
    }
    /**
     * Set model-specific configuration
     */
    config(config) {
        this.variant = {
            ...this.variant,
            config: { ...this.variant.config, ...config },
        };
        return this;
    }
    /**
     * Build the final variant configuration
     * Returns Omit<PromptVariant, "id"> for use in variant config files
     */
    build() {
        // Validate required fields
        if (!this.variant.componentOrder?.length) {
            throw new Error("Component order is required");
        }
        if (!this.variant.description) {
            throw new Error("Description is required");
        }
        if (!this.variant.matcher) {
            throw new Error("Matcher function is required");
        }
        // Auto-generate baseTemplate from componentOrder if not provided
        const baseTemplate = this.variant.baseTemplate || this.generateTemplateFromComponents(this.variant.componentOrder || []);
        return {
            ...this.variant,
            baseTemplate,
        };
    }
    /**
     * Generate a base template from component order
     * Creates a template with placeholders for each component separated by "===="
     */
    generateTemplateFromComponents(components) {
        if (!components.length) {
            throw new Error("Cannot generate template from empty component order");
        }
        return components
            .map((component, index) => {
            // Convert enum value to placeholder format
            // e.g., SystemPromptSection.AGENT_ROLE -> "{{AGENT_ROLE_SECTION}}"
            const placeholder = `{{${component}}}`;
            // Add separator between components (except for the last one)
            return index < components.length - 1 ? `${placeholder}\n\n====\n\n` : placeholder;
        })
            .join("");
    }
}
/**
 * Helper function to create a variant builder for any model family
 */
export const createVariant = (family) => new VariantBuilder(family);
//# sourceMappingURL=variant-builder.js.map