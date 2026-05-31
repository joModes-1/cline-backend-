export function emitTaskStartedMessage(taskId, jsonOutput) {
    if (jsonOutput) {
        process.stdout.write(JSON.stringify({ type: "task_started", taskId }) + "\n");
        return;
    }
    process.stderr.write(`Task started: ${taskId}\n`);
}
//# sourceMappingURL=task-start-output.js.map