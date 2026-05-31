import { AgentConfigLoader } from "@core/task/tools/subagent/AgentConfigLoader";
import { CLINE_MCP_TOOL_IDENTIFIER } from "@/shared/mcp";
import { ModelFamily } from "@/shared/prompts";
import { ClineDefaultTool } from "@/shared/tools";
import { toolSpecFunctionDeclarations, toolSpecFunctionDefinition, toolSpecInputSchema } from "../spec";
export class ClineToolSet {
    id;
    config;
    // A list of tools mapped by model group
    static variants = new Map();
    constructor(id, config) {
        this.id = id;
        this.config = config;
        this._register();
    }
    static register(config) {
        return new ClineToolSet(config.id, config);
    }
    _register() {
        const existingTools = ClineToolSet.variants.get(this.config.variant) || new Set();
        if (!Array.from(existingTools).some((t) => t.config.id === this.config.id)) {
            existingTools.add(this);
            ClineToolSet.variants.set(this.config.variant, existingTools);
        }
    }
    static getTools(variant) {
        const toolsSet = ClineToolSet.variants.get(variant) || new Set();
        const defaultSet = ClineToolSet.variants.get(ModelFamily.GENERIC) || new Set();
        return toolsSet ? Array.from(toolsSet) : Array.from(defaultSet);
    }
    static getRegisteredModelIds() {
        return Array.from(ClineToolSet.variants.keys());
    }
    static getToolByName(toolName, variant) {
        const tools = ClineToolSet.getTools(variant);
        return tools.find((tool) => tool.config.id === toolName);
    }
    // Return a tool by name with fallback to GENERIC and then any other variant where it exists
    static getToolByNameWithFallback(toolName, variant) {
        // Try exact variant first
        const exact = ClineToolSet.getToolByName(toolName, variant);
        if (exact) {
            return exact;
        }
        // Fallback to GENERIC
        const generic = ClineToolSet.getToolByName(toolName, ModelFamily.GENERIC);
        if (generic) {
            return generic;
        }
        // Final fallback: search across all registered variants
        for (const [, tools] of ClineToolSet.variants) {
            const found = Array.from(tools).find((t) => t.config.id === toolName);
            if (found) {
                return found;
            }
        }
        return undefined;
    }
    // Build a list of tools for a variant using requested ids, falling back to GENERIC when missing
    static getToolsForVariantWithFallback(variant, requestedIds) {
        const resolved = [];
        for (const id of requestedIds) {
            const tool = ClineToolSet.getToolByNameWithFallback(id, variant);
            if (tool) {
                // Avoid duplicates by id
                if (!resolved.some((t) => t.config.id === tool.config.id)) {
                    resolved.push(tool);
                }
            }
        }
        return resolved;
    }
    static getEnabledTools(variant, context) {
        const resolved = [];
        const requestedIds = variant.tools ? [...variant.tools] : [];
        for (const id of requestedIds) {
            const tool = ClineToolSet.getToolByNameWithFallback(id, variant.family);
            if (tool) {
                // Avoid duplicates by id
                if (!resolved.some((t) => t.config.id === tool.config.id)) {
                    resolved.push(tool);
                }
            }
        }
        // Filter by context requirements
        const enabledTools = resolved.filter((tool) => !tool.config.contextRequirements || tool.config.contextRequirements(context));
        return enabledTools;
    }
    static getDynamicSubagentToolSpecs(variant, context) {
        if (context.subagentsEnabled !== true || context.isSubagentRun) {
            return [];
        }
        const requestedIds = variant.tools ? [...variant.tools] : [];
        const shouldIncludeSubagentTools = requestedIds.length === 0 || requestedIds.includes(ClineDefaultTool.USE_SUBAGENTS);
        if (!shouldIncludeSubagentTools) {
            return [];
        }
        const agentConfigs = AgentConfigLoader.getInstance().getAllCachedConfigsWithToolNames();
        return agentConfigs.map(({ toolName, config }) => ({
            variant: variant.family,
            id: ClineDefaultTool.USE_SUBAGENTS,
            name: toolName,
            description: `Use the "${config.name}" subagent: ${config.description}`,
            contextRequirements: (ctx) => ctx.subagentsEnabled === true && !ctx.isSubagentRun,
            parameters: [
                {
                    name: "prompt",
                    required: true,
                    instruction: "Helpful instruction for the task that the subagent will perform.",
                },
            ],
        }));
    }
    static getEnabledToolSpecs(variant, context) {
        const registeredTools = ClineToolSet.getEnabledTools(variant, context).map((tool) => tool.config);
        const dynamicSubagentTools = ClineToolSet.getDynamicSubagentToolSpecs(variant, context);
        const includesDynamicSubagents = dynamicSubagentTools.length > 0;
        const filteredRegistered = includesDynamicSubagents
            ? registeredTools.filter((tool) => tool.id !== ClineDefaultTool.USE_SUBAGENTS)
            : registeredTools;
        return [...filteredRegistered, ...dynamicSubagentTools];
    }
    /**
     * Get the appropriate native tool converter for the given provider
     */
    static getNativeConverter(providerId, modelId) {
        switch (providerId) {
            case "minimax":
            case "anthropic":
            case "bedrock":
                return toolSpecInputSchema;
            case "gemini":
                return toolSpecFunctionDeclarations;
            case "vertex":
                if (modelId?.includes("gemini")) {
                    return toolSpecFunctionDeclarations;
                }
                return toolSpecInputSchema;
            default:
                // Default to OpenAI Compatible converter
                return toolSpecFunctionDefinition;
        }
    }
    static getNativeTools(variant, context) {
        // Only return tool functions if the variant explicitly enables them
        // via the "use_native_tools" label set to 1
        // This avoids exposing tools to models that don't support them
        // or variants that aren't designed for tool use
        if (variant.labels.use_native_tools !== 1 || !context.enableNativeToolCalls) {
            return undefined;
        }
        // Base set
        const toolConfigs = ClineToolSet.getEnabledToolSpecs(variant, context);
        // MCP tools
        const mcpServers = context.mcpHub?.getServers()?.filter((s) => s.disabled !== true) || [];
        const mcpTools = mcpServers?.flatMap((server) => mcpToolToClineToolSpec(variant.family, server));
        const enabledTools = [...toolConfigs, ...mcpTools].filter((tool) => typeof tool.description === "string" && tool.description.trim().length > 0);
        const converter = ClineToolSet.getNativeConverter(context.providerInfo.providerId, context.providerInfo.model.id);
        return enabledTools.map((tool) => converter(tool, context));
    }
}
/**
 * Convert an MCP server's tools to ClineToolSpec format
 */
export function mcpToolToClineToolSpec(family, server) {
    const tools = server.tools || [];
    return tools
        .map((mcpTool) => {
        let parameters = [];
        if (mcpTool.inputSchema && "properties" in mcpTool.inputSchema) {
            const schema = mcpTool.inputSchema;
            const requiredFields = new Set(schema.required || []);
            parameters = Object.entries(schema.properties).map(([name, propSchema]) => {
                // Preserve the full schema, not just basic fields
                const param = {
                    name,
                    instruction: propSchema.description || "",
                    type: propSchema.type || "string",
                    required: requiredFields.has(name),
                };
                // Preserve items for array types
                if (propSchema.items) {
                    param.items = propSchema.items;
                }
                // Preserve properties for object types
                if (propSchema.properties) {
                    param.properties = propSchema.properties;
                }
                // Preserve other JSON Schema fields (enum, format, minimum, maximum, etc.)
                for (const key in propSchema) {
                    if (!["type", "description", "items", "properties"].includes(key)) {
                        param[key] = propSchema[key];
                    }
                }
                return param;
            });
        }
        const mcpToolName = server.uid + CLINE_MCP_TOOL_IDENTIFIER + mcpTool.name;
        // NOTE: When the name is too long, the provider API will reject the tool registration with the following error:
        // `Invalid 'tools[n].name': string too long. Expected a string with maximum length 64, but got a string with length n instead.`
        // To avoid this, we skip registering tools with names that are too long.
        if (mcpToolName?.length <= 64) {
            return {
                variant: family,
                id: ClineDefaultTool.MCP_USE,
                // We will use the identifier to reconstruct the MCP server and tool name later
                name: mcpToolName,
                description: `${server.name}: ${mcpTool.description || mcpTool.name}`,
                parameters,
            };
        }
        return undefined;
    })
        .filter((t) => t !== undefined);
}
//# sourceMappingURL=ClineToolSet.js.map