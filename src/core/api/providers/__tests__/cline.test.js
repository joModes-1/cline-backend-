import "should";
import { openRouterDefaultModelInfo } from "@shared/api";
import sinon from "sinon";
import { ClineAccountService } from "@/services/account/ClineAccountService";
import { AuthService } from "@/services/auth/AuthService";
import { ClineHandler } from "../cline";
describe("ClineHandler", () => {
    afterEach(() => {
        sinon.restore();
    });
    const createAsyncIterable = (data = []) => ({
        [Symbol.asyncIterator]: async function* () {
            yield* data;
        },
    });
    const createHandler = (options) => {
        sinon.stub(ClineAccountService, "getInstance").returns({});
        sinon.stub(AuthService, "getInstance").returns({});
        return new ClineHandler(options);
    };
    it("should handle usage-only chunks when delta is missing", async () => {
        const handler = createHandler({});
        const fakeClient = {
            chat: {
                completions: {
                    create: sinon.stub().resolves(createAsyncIterable([
                        {
                            choices: [{}],
                            usage: {
                                prompt_tokens: 17,
                                completion_tokens: 9,
                            },
                        },
                    ])),
                },
            },
        };
        sinon.stub(handler, "ensureClient").resolves(fakeClient);
        sinon.stub(handler, "getModel").returns({
            id: "openai/gpt-4o-mini",
            info: openRouterDefaultModelInfo,
        });
        const chunks = [];
        for await (const chunk of handler.createMessage("system", [{ role: "user", content: "hi" }])) {
            chunks.push(chunk);
        }
        chunks.should.deepEqual([
            {
                type: "usage",
                cacheWriteTokens: 0,
                cacheReadTokens: 0,
                inputTokens: 17,
                outputTokens: 9,
                totalCost: 0,
            },
        ]);
    });
    it("should forward enableParallelToolCalling to OpenRouter payload", async () => {
        const handler = createHandler({ enableParallelToolCalling: true });
        const createStub = sinon.stub().resolves(createAsyncIterable([]));
        const fakeClient = {
            chat: {
                completions: {
                    create: createStub,
                },
            },
        };
        sinon.stub(handler, "ensureClient").resolves(fakeClient);
        sinon.stub(handler, "getModel").returns({
            id: "openai/gpt-4o-mini",
            info: openRouterDefaultModelInfo,
        });
        const tools = [
            { type: "function", function: { name: "read_file", description: "", parameters: { type: "object" } } },
        ];
        for await (const _chunk of handler.createMessage("system", [{ role: "user", content: "hi" }], tools)) {
            // drain stream
        }
        const payload = createStub.firstCall.args[0];
        payload.parallel_tool_calls.should.equal(true);
    });
});
//# sourceMappingURL=cline.test.js.map