// Mock for @google/genai module to avoid ESM compatibility issues in tests
export class GoogleGenAI {
    constructor(_options) {
        // Mock constructor
    }
    models = {
        generateContentStream: async (_params) => {
            // Mock implementation that returns an async iterator
            return {
                async *[Symbol.asyncIterator]() {
                    yield {
                        text: "Mock response",
                        candidates: [],
                        usageMetadata: {
                            promptTokenCount: 100,
                            candidatesTokenCount: 50,
                            thoughtsTokenCount: 0,
                            cachedContentTokenCount: 0,
                        },
                    };
                },
            };
        },
        countTokens: async (_params) => {
            // Mock token counting
            return {
                totalTokens: 100,
            };
        },
    };
}
//# sourceMappingURL=gemini-mock.test.js.map