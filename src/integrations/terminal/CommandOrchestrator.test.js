import assert from "node:assert/strict";
import { EventEmitter } from "events";
import { describe, it } from "mocha";
import { orchestrateCommandExecution } from "./CommandOrchestrator";
class FakeTerminalProcess extends EventEmitter {
    isHot = false;
    waitForShellIntegration = false;
    promise;
    resolvePromise;
    rejectPromise;
    constructor() {
        super();
        this.promise = new Promise((resolve, reject) => {
            this.resolvePromise = resolve;
            this.rejectPromise = reject;
        });
    }
    continue() {
        this.emit("continue");
        this.resolvePromise();
    }
    getUnretrievedOutput() {
        return "";
    }
    getCompletionDetails() {
        return {};
    }
    complete(details) {
        this.emit("completed", details);
        this.emit("continue");
        this.resolvePromise();
    }
    fail(error) {
        this.emit("error", error);
        this.rejectPromise(error);
    }
    asResultPromise() {
        const processWithPromise = this;
        processWithPromise.then = this.promise.then.bind(this.promise);
        processWithPromise.catch = this.promise.catch.bind(this.promise);
        processWithPromise.finally = this.promise.finally.bind(this.promise);
        return processWithPromise;
    }
}
function createCallbacks() {
    return {
        say: async () => undefined,
        ask: async () => ({ response: "messageResponse" }),
        updateBackgroundCommandState: () => { },
        updateClineMessage: async () => { },
        getClineMessages: () => [],
        addToUserMessageContent: () => { },
    };
}
function createTerminalManager() {
    return {
        processOutput: (outputLines) => outputLines.join("\n"),
    };
}
describe("CommandOrchestrator exit status messaging", () => {
    it("reports non-zero exit codes as command failures", async () => {
        const process = new FakeTerminalProcess();
        const orchestrationPromise = orchestrateCommandExecution(process.asResultPromise(), createTerminalManager(), createCallbacks(), { command: "false" });
        process.complete({ exitCode: 2, signal: null });
        const result = await orchestrationPromise;
        assert.equal(result.completed, true);
        assert.equal(result.exitCode, 2);
        assert.match(result.result, /^Command failed with exit code 2\./);
    });
    it("reports successful command completion with explicit exit code", async () => {
        const process = new FakeTerminalProcess();
        const orchestrationPromise = orchestrateCommandExecution(process.asResultPromise(), createTerminalManager(), createCallbacks(), { command: "echo ok" });
        process.complete({ exitCode: 0, signal: null });
        const result = await orchestrationPromise;
        assert.equal(result.completed, true);
        assert.equal(result.exitCode, 0);
        assert.match(result.result, /^Command executed successfully \(exit code 0\)\./);
    });
});
//# sourceMappingURL=CommandOrchestrator.test.js.map