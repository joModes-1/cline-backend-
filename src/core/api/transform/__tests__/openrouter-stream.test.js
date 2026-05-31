import { describe, it } from "mocha";
import "should";
import sinon from "sinon";
import { createOpenRouterStream } from "../openrouter-stream";
describe("createOpenRouterStream", () => {
    const createAsyncIterable = () => ({
        async *[Symbol.asyncIterator]() { },
    });
    const createClient = () => {
        const create = sinon.stub().resolves(createAsyncIterable());
        return {
            client: {
                chat: {
                    completions: {
                        create,
                    },
                },
            },
            create,
        };
    };
    const createModelInfo = (maxTokens) => ({
        maxTokens,
        contextWindow: 1_048_576,
        supportsImages: true,
        supportsPromptCache: false,
    });
    it("caps Gemini Flash OpenRouter requests to 8192 max_tokens", async () => {
        const { client, create } = createClient();
        await createOpenRouterStream(client, "system prompt", [{ role: "user", content: "hello" }], {
            id: "google/gemini-2.5-flash",
            info: createModelInfo(65_536),
        });
        const payload = create.firstCall.args[0];
        payload.should.have.property("max_tokens", 8_192);
    });
    it("keeps lower Gemini Flash max_tokens values when already below 8192", async () => {
        const { client, create } = createClient();
        await createOpenRouterStream(client, "system prompt", [{ role: "user", content: "hello" }], {
            id: "google/gemini-2.5-flash",
            info: createModelInfo(4_096),
        });
        const payload = create.firstCall.args[0];
        payload.should.have.property("max_tokens", 4_096);
    });
    it("does not send max_tokens for non-Gemini models", async () => {
        const { client, create } = createClient();
        await createOpenRouterStream(client, "system prompt", [{ role: "user", content: "hello" }], {
            id: "anthropic/claude-sonnet-4.5",
            info: createModelInfo(64_000),
        });
        const payload = create.firstCall.args[0];
        payload.should.not.have.property("max_tokens");
    });
    it("does not send max_tokens for non-Flash Gemini models", async () => {
        const { client, create } = createClient();
        await createOpenRouterStream(client, "system prompt", [{ role: "user", content: "hello" }], {
            id: "google/gemini-2.5-pro",
            info: createModelInfo(65_536),
        });
        const payload = create.firstCall.args[0];
        payload.should.not.have.property("max_tokens");
    });
});
//# sourceMappingURL=openrouter-stream.test.js.map