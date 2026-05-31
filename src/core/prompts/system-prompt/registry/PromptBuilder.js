import { Logger } from "@/shared/services/Logger";
import { ClineToolSet } from "../registry/ClineToolSet";
import { resolveInstruction } from "../spec";
import { STANDARD_PLACEHOLDERS } from "../templates/placeholders";
import { TemplateEngine } from "../templates/TemplateEngine";
// Pre-defined mapping of standard placeholders to avoid runtime object creation
const STANDARD_PLACEHOLDER_KEYS = Object.values(STANDARD_PLACEHOLDERS);
export class PromptBuilder {
    variant;
    context;
    components;
    templateEngine;
    constructor(variant, context, components) {
        this.variant = variant;
        this.context = context;
        this.components = components;
        this.templateEngine = new TemplateEngine();
    }
    async build() {
        const componentSections = await this.buildComponents();
        const placeholderValues = this.preparePlaceholders(componentSections);
        const prompt = this.templateEngine.resolve(this.variant.baseTemplate, this.context, placeholderValues);
        return this.postProcess(prompt);
    }
    async buildComponents() {
        const sections = {};
        const { componentOrder } = this.variant;
        // Process components sequentially to maintain order
        for (const componentId of componentOrder) {
            const componentFn = this.components[componentId];
            if (!componentFn) {
                Logger.warn(`Warning: Component '${componentId}' not found`);
                continue;
            }
            try {
                const result = await componentFn(this.variant, this.context);
                if (result?.trim()) {
                    sections[componentId] = result;
                }
            }
            catch (error) {
                Logger.warn(`Warning: Failed to build component '${componentId}':`, error);
            }
        }
        return sections;
    }
    preparePlaceholders(componentSections) {
        // Create base placeholders object with optimal capacity
        const placeholders = {};
        // Add variant placeholders
        Object.assign(placeholders, this.variant.placeholders);
        // Add standard system placeholders
        placeholders[STANDARD_PLACEHOLDERS.CWD] = this.context.cwd || process.cwd();
        placeholders[STANDARD_PLACEHOLDERS.SUPPORTS_BROWSER] = this.context.supportsBrowserUse || false;
        placeholders[STANDARD_PLACEHOLDERS.MODEL_FAMILY] = this.variant.family;
        placeholders[STANDARD_PLACEHOLDERS.CURRENT_DATE] = new Date().toISOString().split("T")[0];
        // Add all component sections
        Object.assign(placeholders, componentSections);
        // Map component sections to standard placeholders in a single loop
        for (const key of STANDARD_PLACEHOLDER_KEYS) {
            if (!placeholders[key]) {
                placeholders[key] = componentSections[key] || "";
            }
        }
        // Add runtime placeholders with highest priority
        const runtimePlaceholders = this.context.runtimePlaceholders;
        if (runtimePlaceholders) {
            Object.assign(placeholders, runtimePlaceholders);
        }
        return placeholders;
    }
    postProcess(prompt) {
        if (!prompt) {
            return "";
        }
        // Combine multiple regex operations for better performance
        return prompt
            .replace(/\n\s*\n\s*\n/g, "\n\n") // Remove multiple consecutive empty lines
            .trim() // Remove leading/trailing whitespace
            .replace(/====+\s*$/, "") // Remove trailing ==== after trim
            .replace(/\n====+\s*\n+\s*====+\n/g, "\n====\n") // Remove empty sections between separators
            .replace(/====\s*\n\s*====\s*\n/g, "====\n") // Remove consecutive empty sections
            .replace(/^##\s*$[\r\n]*/gm, "") // Remove empty section headers (## with no content)
            .replace(/\n##\s*$[\r\n]*/gm, "") // Remove empty section headers that appear mid-document
            .replace(/====+\n(?!\n)([^\n])/g, (match, _nextChar, offset, string) => {
            // Add extra newline after ====+ if not already followed by a newline
            // Exception: preserve single newlines when ====+ appears to be part of diff-like content
            // Look for patterns like "SEARCH\n=======\n" or ";\n=======\n" (diff markers)
            const beforeContext = string.substring(Math.max(0, offset - 50), offset);
            const afterContext = string.substring(offset, Math.min(string.length, offset + 50));
            const isDiffLike = /SEARCH|REPLACE|\+\+\+\+\+\+\+|-------/.test(beforeContext + afterContext);
            return isDiffLike ? match : match.replace(/\n/, "\n\n");
        })
            .replace(/([^\n])\n(?!\n)====+/g, (match, prevChar, offset, string) => {
            // Add extra newline before ====+ if not already preceded by a newline
            // Exception: preserve single newlines when ====+ appears to be part of diff-like content
            const beforeContext = string.substring(Math.max(0, offset - 50), offset);
            const afterContext = string.substring(offset, Math.min(string.length, offset + 50));
            const isDiffLike = /SEARCH|REPLACE|\+\+\+\+\+\+\+|-------/.test(beforeContext + afterContext);
            return isDiffLike ? match : prevChar + "\n\n" + match.substring(1).replace(/\n/, "");
        })
            .replace(/\n\s*\n\s*\n/g, "\n\n") // Clean up any multiple empty lines created by header removal
            .trim(); // Final trim to remove any whitespace added by regex operations
    }
    getBuildMetadata() {
        return {
            variantId: this.variant.id,
            version: this.variant.version,
            componentsUsed: [...this.variant.componentOrder],
            placeholdersResolved: this.templateEngine.extractPlaceholders(this.variant.baseTemplate),
        };
    }
    static getEnabledTools(variant, context) {
        return ClineToolSet.getEnabledToolSpecs(variant, context);
    }
    static async getToolsPrompts(variant, context) {
        const enabledTools = PromptBuilder.getEnabledTools(variant, context);
        const ids = enabledTools.map((tool) => tool.id);
        return Promise.all(enabledTools.map((tool) => PromptBuilder.tool(tool, ids, context)));
    }
    static tool(config, registry, context) {
        // Skip tools without parameters or description - those are placeholder tools
        if (!config.parameters?.length && !config.description?.length) {
            return "";
        }
        const displayName = config.name || config.id;
        const title = `## ${displayName}`;
        const description = [`Description: ${config.description}`];
        if (!config.parameters?.length) {
            config.parameters = [];
        }
        // Clone parameters to avoid mutating original
        const params = [...config.parameters];
        // Filter parameters based on dependencies and contextRequirements
        const filteredParams = params.filter((p) => {
            // Check dependencies first (existing behavior)
            if (p.dependencies?.length) {
                if (!p.dependencies.every((d) => registry.includes(d))) {
                    return false;
                }
            }
            // Check contextRequirements (new behavior)
            if (p.contextRequirements) {
                return p.contextRequirements(context);
            }
            return true;
        });
        // Collect additional descriptions only from filtered parameters
        const additionalDesc = filteredParams.map((p) => p.description).filter((desc) => Boolean(desc));
        if (additionalDesc.length) {
            description.push(...additionalDesc);
        }
        // Build prompt sections efficiently
        const sections = [
            title,
            description.join("\n"),
            PromptBuilder.buildParametersSection(filteredParams, context),
            PromptBuilder.buildUsageSection(displayName, filteredParams),
        ];
        return sections.filter(Boolean).join("\n");
    }
    static buildParametersSection(params, context) {
        if (!params.length) {
            return "Parameters: None";
        }
        const paramList = params.map((p) => {
            const requiredText = p.required ? "required" : "optional";
            const instruction = resolveInstruction(p.instruction, context);
            return `- ${p.name}: (${requiredText}) ${instruction}`;
        });
        return ["Parameters:", ...paramList].join("\n");
    }
    static buildUsageSection(toolId, params) {
        const usageSection = ["Usage:"];
        const usageTag = `<${toolId}>`;
        const usageEndTag = `</${toolId}>`;
        usageSection.push(usageTag);
        // Add parameter usage tags
        for (const param of params) {
            const usage = param.usage || "";
            usageSection.push(`<${param.name}>${usage}</${param.name}>`);
        }
        usageSection.push(usageEndTag);
        return usageSection.join("\n");
    }
}
//# sourceMappingURL=PromptBuilder.js.map