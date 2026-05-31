import { expect } from "chai";
import { describe, it } from "mocha";
import { ModelFamily } from "@/shared/prompts";
import { ClineDefaultTool } from "@/shared/tools";
import { toolSpecFunctionDeclarations, toolSpecFunctionDefinition, toolSpecInputSchema } from "../spec";
const mockContext = {
    cwd: "/test/project",
    ide: "TestIde",
    supportsBrowserUse: true,
    clineWebToolsEnabled: true,
    subagentsEnabled: true,
    providerInfo: { providerId: "test", model: { id: "test-model", info: { supportsPromptCache: false } }, mode: "act" },
    enableNativeToolCalls: false,
    isTesting: true,
};
const makeTool = (overrides) => ({
    variant: ModelFamily.GENERIC,
    id: ClineDefaultTool.FILE_READ,
    name: "read_file",
    description: "Read a file",
    parameters: [
        {
            name: "path",
            required: true,
            instruction: "The path of the file to read relative to {{CWD}}",
        },
        {
            name: "optional_param",
            required: false,
            instruction: "An optional parameter",
        },
    ],
    ...overrides,
});
describe("toolSpecFunctionDeclarations (Gemini)", () => {
    it("includes parameter descriptions from instruction field", () => {
        const result = toolSpecFunctionDeclarations(makeTool(), mockContext);
        const pathParam = result.parameters?.properties?.["path"];
        expect(pathParam).to.exist;
        expect(pathParam.description).to.be.a("string");
        expect(pathParam.description).to.include("path of the file to read");
    });
    it("includes descriptions for all parameters", () => {
        const result = toolSpecFunctionDeclarations(makeTool(), mockContext);
        const props = result.parameters?.properties;
        expect(props["path"].description).to.be.a("string").and.not.be.empty;
        expect(props["optional_param"].description).to.be.a("string").and.not.be.empty;
    });
    it("handles function-type instructions", () => {
        const tool = makeTool({
            parameters: [
                {
                    name: "dynamic",
                    required: true,
                    instruction: (ctx) => `Dynamic value: ${ctx.cwd}`,
                },
            ],
        });
        const result = toolSpecFunctionDeclarations(tool, mockContext);
        const param = result.parameters?.properties?.["dynamic"];
        expect(param.description).to.equal("Dynamic value: /test/project");
    });
    it("omits description when instruction is empty", () => {
        const tool = makeTool({
            parameters: [{ name: "empty", required: false, instruction: "" }],
        });
        const result = toolSpecFunctionDeclarations(tool, mockContext);
        const param = result.parameters?.properties?.["empty"];
        expect(param.description).to.be.undefined;
    });
});
describe("Gemini and Anthropic parameter descriptions match", () => {
    it("both converters produce the same description text", () => {
        const tool = makeTool();
        const gemini = toolSpecFunctionDeclarations(tool, mockContext);
        const anthropic = toolSpecInputSchema(tool, mockContext);
        const geminiDesc = gemini.parameters?.properties?.["path"]?.description;
        const anthropicDesc = anthropic.input_schema.properties["path"]?.description;
        expect(geminiDesc).to.equal(anthropicDesc);
    });
});
describe("native tool placeholder replacement", () => {
    it("replaces CWD and MULTI_ROOT_HINT placeholders in descriptions", () => {
        const context = {
            ...mockContext,
            isMultiRootEnabled: true,
        };
        const tool = makeTool({
            parameters: [
                {
                    name: "path",
                    required: true,
                    instruction: "Path (relative to {{CWD}}){{MULTI_ROOT_HINT}}",
                },
            ],
        });
        const openAI = toolSpecFunctionDefinition(tool, context);
        const anthropic = toolSpecInputSchema(tool, context);
        const gemini = toolSpecFunctionDeclarations(tool, context);
        const openAIDesc = openAI.function.parameters.properties.path.description;
        const anthropicDesc = anthropic.input_schema.properties.path.description;
        const geminiDesc = gemini.parameters?.properties?.["path"]?.description;
        for (const desc of [openAIDesc, anthropicDesc, geminiDesc]) {
            expect(desc).to.include("/test/project");
            expect(desc).to.include("Use @workspace:path syntax");
            expect(desc).to.not.include("{{CWD}}");
            expect(desc).to.not.include("{{MULTI_ROOT_HINT}}");
        }
    });
});
//# sourceMappingURL=spec.test.js.map