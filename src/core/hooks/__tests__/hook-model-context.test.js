import { describe, it } from "mocha";
import "should";
import { getHookModelContext } from "../hook-model-context";
describe("getHookModelContext", () => {
    it("should return concrete provider and model slug for plan mode", () => {
        const api = {
            getModel: () => ({ id: "handler-model-id" }),
        };
        const stateManager = {
            getGlobalSettingsKey: (key) => (key === "mode" ? "plan" : undefined),
            getApiConfiguration: () => ({
                planModeApiProvider: "openrouter",
                planModeOpenRouterModelId: "anthropic/claude-sonnet-4.5",
                actModeApiProvider: "openai",
            }),
        };
        const context = getHookModelContext(api, stateManager);
        context.provider?.should.equal("openrouter");
        context.slug?.should.equal("anthropic/claude-sonnet-4.5");
    });
    it("should return concrete provider and model slug for act mode", () => {
        const api = {
            getModel: () => ({ id: "handler-act-model" }),
        };
        const stateManager = {
            getGlobalSettingsKey: (key) => (key === "mode" ? "act" : undefined),
            getApiConfiguration: () => ({
                planModeApiProvider: "openrouter",
                actModeApiProvider: "openai",
                actModeOpenAiModelId: "gpt-5",
            }),
        };
        const context = getHookModelContext(api, stateManager);
        context.provider?.should.equal("openai");
        context.slug?.should.equal("gpt-5");
    });
    it("should fall back to unknown values when provider/slug are unavailable", () => {
        const api = {
            getModel: () => ({ id: "" }),
        };
        const stateManager = {
            getGlobalSettingsKey: (_) => "act",
            getApiConfiguration: () => ({
                planModeApiProvider: "anthropic",
                actModeApiProvider: "",
            }),
        };
        const context = getHookModelContext(api, stateManager);
        context.provider?.should.equal("unknown");
        context.slug?.should.equal("unknown");
    });
});
//# sourceMappingURL=hook-model-context.test.js.map