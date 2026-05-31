import { Type as GoogleToolParamType } from "@google/genai";
import { MULTI_ROOT_HINT } from "./constants";
/**
 * Converts a ClineToolSpec into an OpenAI ChatCompletionTool definition
 * Docs: https://openrouter.ai/docs/features/tool-calling#step-1-inference-request-with-tools
 */
export function toolSpecFunctionDefinition(tool, context) {
    // Check if the tool should be included based on context requirements
    if (tool.contextRequirements && !tool.contextRequirements(context)) {
        throw new Error(`Tool ${tool.name} does not meet context requirements`);
    }
    // Build the properties object for parameters
    const properties = {};
    const required = [];
    if (tool.parameters) {
        for (const param of tool.parameters) {
            // Check if parameter should be included based on context requirements
            if (param.contextRequirements && !param.contextRequirements(context)) {
                continue;
            }
            // Add to required array if parameter is required
            if (param.required) {
                required.push(param.name);
            }
            // Determine parameter type - use explicit type if provided.
            // Default to string
            const paramType = param.type || "string";
            // Build parameter schema
            const paramSchema = {
                type: paramType,
                description: replacer(resolveInstruction(param.instruction, context), context),
            };
            // Add items for array types
            if (paramType === "array" && param.items) {
                paramSchema.items = param.items;
            }
            // Add properties for object types
            if (paramType === "object" && param.properties) {
                paramSchema.properties = param.properties;
            }
            // Preserve any additional JSON Schema fields from MCP tools
            // (e.g., enum, format, minimum, maximum, etc.)
            const reservedKeys = new Set([
                "name",
                "required",
                "instruction",
                "usage",
                "dependencies",
                "description",
                "contextRequirements",
                "type",
                "items",
                "properties",
            ]);
            for (const key in param) {
                if (!reservedKeys.has(key) && param[key] !== undefined) {
                    paramSchema[key] = param[key];
                }
            }
            // Add usage example as part of description if available
            // if (param.usage) {
            // 	paramSchema.description += ` Example: ${param.usage}`
            // }
            properties[param.name] = paramSchema;
        }
    }
    // Build the ChatCompletionTool object
    const chatCompletionTool = {
        type: "function",
        function: {
            name: tool.name,
            description: replacer(tool.description, context),
            strict: false,
            parameters: {
                type: "object",
                properties,
                required,
                additionalProperties: false,
            },
        },
    };
    return chatCompletionTool;
}
/**
 * Converts a ClineToolSpec into an Anthropic Tool definition
 */
export function toolSpecInputSchema(tool, context) {
    // Check if the tool should be included based on context requirements
    if (tool.contextRequirements && !tool.contextRequirements(context)) {
        throw new Error(`Tool ${tool.name} does not meet context requirements`);
    }
    // Build the properties object for parameters
    const properties = {};
    const required = [];
    if (tool.parameters) {
        for (const param of tool.parameters) {
            // Check if parameter should be included based on context requirements
            if (param.contextRequirements && !param.contextRequirements(context)) {
                continue;
            }
            // Add to required array if parameter is required
            if (param.required) {
                required.push(param.name);
            }
            // Determine parameter type - use explicit type if provided.
            // Default to string
            const paramType = param.type || "string";
            // Build parameter schema
            const paramSchema = {
                type: paramType,
                description: replacer(resolveInstruction(param.instruction, context), context),
            };
            // Add items for array types
            if (paramType === "array" && param.items) {
                paramSchema.items = param.items;
            }
            // Add properties for object types
            if (paramType === "object" && param.properties) {
                paramSchema.properties = param.properties;
            }
            // Preserve any additional JSON Schema fields from MCP tools
            // (e.g., enum, format, minimum, maximum, etc.)
            const reservedKeys = new Set([
                "name",
                "required",
                "instruction",
                "usage",
                "dependencies",
                "description",
                "contextRequirements",
                "type",
                "items",
                "properties",
            ]);
            for (const key in param) {
                if (!reservedKeys.has(key) && param[key] !== undefined) {
                    paramSchema[key] = param[key];
                }
            }
            // Add usage example as part of description if available
            // if (param.usage) {
            // 	paramSchema.description += ` Example: ${param.usage}`
            // }
            properties[param.name] = paramSchema;
        }
    }
    // Build the Tool object
    const toolInputSchema = {
        name: tool.name,
        description: replacer(tool.description, context),
        input_schema: {
            type: "object",
            properties,
            required,
        },
    };
    return toolInputSchema;
}
const GOOGLE_TOOL_PARAM_MAP = {
    string: "STRING",
    number: "NUMBER",
    integer: "NUMBER",
    boolean: "BOOLEAN",
    object: "OBJECT",
    array: "STRING",
};
/**
 * Converts a ClineToolSpec into a Google Gemini function.
 * Docs: https://ai.google.dev/gemini-api/docs/function-calling
 */
export function toolSpecFunctionDeclarations(tool, context) {
    // Check if the tool should be included based on context requirements
    if (tool.contextRequirements && !tool.contextRequirements(context)) {
        throw new Error(`Tool ${tool.name} does not meet context requirements`);
    }
    // Build the parameters object for parameters
    const properties = {};
    const required = [];
    if (tool.parameters) {
        for (const param of tool.parameters) {
            // Check if parameter should be included based on context requirements
            if (param.contextRequirements && !param.contextRequirements(context)) {
                continue;
            }
            if (!param.name) {
                continue;
            }
            // Add to required array if parameter is required
            if (param.required) {
                required.push(param.name);
            }
            const paramSchema = {
                type: GOOGLE_TOOL_PARAM_MAP[param.type || "string"] || GoogleToolParamType.OBJECT,
            };
            if (param.instruction) {
                const desc = replacer(resolveInstruction(param.instruction, context), context);
                if (desc) {
                    paramSchema.description = desc;
                }
            }
            if (param.properties) {
                paramSchema.properties = {};
                for (const [key, prop] of Object.entries(param.properties)) {
                    // Skip $schema property
                    if (key === "$schema") {
                        continue;
                    }
                    paramSchema.properties[key] = {
                        type: GOOGLE_TOOL_PARAM_MAP[prop.type || "string"] || GoogleToolParamType.OBJECT,
                        description: replacer(resolveInstruction(param.instruction, context), context),
                    };
                    // Handle enum values
                    if (prop.enum) {
                        paramSchema.properties[key].enum = prop.enum;
                    }
                }
            }
            properties[param.name] = paramSchema;
        }
    }
    const googleTool = {
        name: tool.name,
        description: replacer(tool.description, context),
        parameters: {
            type: GoogleToolParamType.OBJECT,
            properties,
            required,
        },
    };
    return googleTool;
}
/**
 * Converts an OpenAI ChatCompletionTool into an Anthropic Tool definition
 */
export function openAIToolToAnthropic(openAITool) {
    if (openAITool.type === "function") {
        const func = openAITool.function;
        return {
            name: func.name,
            description: func.description || "",
            input_schema: {
                type: "object",
                properties: func.parameters?.properties || {},
                required: func.parameters?.required || [],
            },
        };
    }
    return {
        name: openAITool.custom.name,
        description: openAITool.custom.description || "",
        input_schema: {
            type: "object",
            required: openAITool.custom.format?.type === "text" ? ["text"] : [],
            properties: openAITool.custom.format?.type === "text" ? { text: { type: "string" } } : { grammar: { type: "object" } },
        },
    };
}
/**
 * Converts OpenAI tools to Response API format.
 * Filters for function-type tools and applies Response API defaults.
 */
export function toOpenAIResponseTools(openAITools) {
    if (!openAITools) {
        return [];
    }
    return openAITools
        .filter((tool) => tool.type === "function")
        .map((tool) => ({
        type: "function",
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters ?? null,
        strict: tool.function.strict ?? true,
    }));
}
/**
 * Converts an OpenAI ChatCompletionTool into Response API format.
 */
export function toOpenAIResponsesAPITool(openAITool) {
    if (openAITool.type === "function") {
        const fn = openAITool.function;
        return {
            type: "function",
            name: fn.name,
            description: fn.description || "",
            strict: fn.strict || false,
            parameters: {
                type: "object",
                properties: fn.parameters?.properties || {},
                required: fn.parameters?.required || [],
            },
        };
    }
    // Handle custom tool type
    const custom = openAITool.custom;
    const isTextFormat = custom.format?.type === "text";
    return {
        type: "function",
        name: custom.name,
        description: custom.description || "",
        strict: false,
        parameters: {
            type: "object",
            properties: isTextFormat ? { text: { type: "string" } } : { grammar: { type: "object" } },
            required: ["text"],
        },
    };
}
/**
 * Replaces template placeholders in descriptions for native tool schemas.
 */
function replacer(description, context) {
    const width = context.browserSettings?.viewport?.width || 900;
    const height = context.browserSettings?.viewport?.height || 600;
    const cwd = context.cwd || process.cwd();
    const multiRootHint = context.isMultiRootEnabled ? MULTI_ROOT_HINT : "";
    return description
        .replace(/{{BROWSER_VIEWPORT_WIDTH}}/g, String(width))
        .replace(/{{BROWSER_VIEWPORT_HEIGHT}}/g, String(height))
        .replace(/{{CWD}}/g, cwd)
        .replace(/{{MULTI_ROOT_HINT}}/g, multiRootHint);
}
/**
 * Resolves an instruction that may be a string or a function.
 */
export function resolveInstruction(instruction, context) {
    return typeof instruction === "function" ? instruction(context) : instruction;
}
//# sourceMappingURL=spec.js.map