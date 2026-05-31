import { expect } from "chai";
import { beforeEach, describe, it } from "mocha";
import { ModelFamily } from "@/shared/prompts";
import { ClineDefaultTool } from "@/shared/tools";
import { getSystemPrompt } from "../index";
import { PromptRegistry } from "../registry/PromptRegistry";
const makeContext = (modelId) => ({
    cwd: "/test/project",
    ide: "TestIde",
    supportsBrowserUse: true,
    clineWebToolsEnabled: true,
    focusChainSettings: { enabled: true, remindClineInterval: 6 },
    browserSettings: { viewport: { width: 1280, height: 720 } },
    isTesting: true,
    enableNativeToolCalls: true,
    providerInfo: {
        providerId: "openai-compatible",
        model: { id: modelId, info: { supportsPromptCache: false } },
        mode: "act",
    },
});
const toolNamesFrom = (tools) => (tools ?? [])
    .map((tool) => tool?.function?.name ?? tool?.name)
    .filter((name) => typeof name === "string");
describe("OpenAI-compatible gpt-oss native tools smoke test", () => {
    beforeEach(() => {
        PromptRegistry.dispose();
    });
    it("uses the NATIVE_GPT_5 prompt family for gpt-oss when native tools are enabled", async () => {
        const registry = PromptRegistry.getInstance();
        await registry.load();
        const family = registry.getModelFamily(makeContext("gpt-oss-120b"));
        expect(family).to.equal(ModelFamily.NATIVE_GPT_5);
    });
    it("exposes apply_patch for gpt-oss-120b so file editing remains native", async () => {
        const { tools } = await getSystemPrompt(makeContext("gpt-oss-120b"));
        const toolNames = toolNamesFrom(tools);
        expect(toolNames).to.include(ClineDefaultTool.BASH);
        expect(toolNames).to.include(ClineDefaultTool.FILE_READ);
        expect(toolNames).to.include(ClineDefaultTool.APPLY_PATCH);
        expect(toolNames).to.not.include(ClineDefaultTool.FILE_NEW);
        expect(toolNames).to.not.include(ClineDefaultTool.FILE_EDIT);
    });
    it("control: gpt-5-codex still receives apply_patch", async () => {
        const { tools } = await getSystemPrompt(makeContext("gpt-5-codex"));
        const toolNames = toolNamesFrom(tools);
        expect(toolNames).to.include(ClineDefaultTool.APPLY_PATCH);
    });
});
//# sourceMappingURL=openai-compatible-gpt-oss-file-tools.test.js.map