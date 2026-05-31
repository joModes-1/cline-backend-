import { writeFile } from "@utils/fs";
import fs from "fs/promises";
import * as path from "path";
const LOG_FILE_PREFIX = "grpc_recorded_session";
export class LogFileHandlerNoops {
    async initialize(_initialData) { }
    async write(_sessionLog) { }
}
/**
 * Default implementation of `ILogFileHandler` that persists logs to disk.
 *
 * - Creates a log file inside the workspace `tests/specs` folder.
 * - Uses a timestamped filename by default, unless overridden by an env var.
 * - Saves logs in JSON format.
 */
export class LogFileHandler {
    logFilePath;
    constructor() {
        const fileName = this.getFileName();
        const workspaceFolder = process.env.DEV_WORKSPACE_FOLDER ?? process.cwd();
        const folderPath = path.join(workspaceFolder, "tests", "specs");
        this.logFilePath = path.join(folderPath, fileName);
    }
    getFilePath() {
        return this.logFilePath;
    }
    getFileName() {
        const envFileName = path.basename(process.env.GRPC_RECORDER_FILE_NAME || "").replace(/[^a-zA-Z0-9-_]/g, "_");
        if (envFileName && envFileName.trim().length > 0) {
            return `${LOG_FILE_PREFIX}_${envFileName}.json`;
        }
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        return `${LOG_FILE_PREFIX}_${timestamp}.json`;
    }
    async initialize(initialData) {
        await fs.mkdir(path.dirname(this.logFilePath), { recursive: true });
        await writeFile(this.logFilePath, JSON.stringify(initialData, null, 2), "utf8");
    }
    async write(sessionLog) {
        await writeFile(this.logFilePath, JSON.stringify(sessionLog, null, 2), "utf8");
    }
}
//# sourceMappingURL=log-file-handler.js.map