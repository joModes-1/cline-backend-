/**
 * VSCode namespace shim for CLI mode
 * Provides minimal stubs for VSCode types and enums used by the codebase
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import pino from "pino";
import { printError, printInfo, printWarning } from "./utils/display";
import { CLINE_CLI_DIR } from "./utils/path";
export { URI } from "vscode-uri";
export { ClineFileStorage } from "@/shared/storage";
export const CLI_LOG_FILE = path.join(CLINE_CLI_DIR.log, "cline-cli.1.log");
/**
 * Safely read and parse a JSON file, returning a default value on failure
 */
export function readJson(filePath, defaultValue = {}) {
    try {
        if (existsSync(filePath)) {
            return JSON.parse(readFileSync(filePath, "utf8"));
        }
    }
    catch {
        // Return default if file doesn't exist or is invalid
    }
    return defaultValue;
}
/**
 * Mock environment variable collection for non-VSCode environments
 */
export class EnvironmentVariableCollection {
    variables = new Map();
    persistent = true;
    description = "CLI Environment Variables";
    entries() {
        return this.variables.entries();
    }
    replace(variable, value) {
        this.variables.set(variable, { value, type: "replace" });
    }
    append(variable, value) {
        this.variables.set(variable, { value, type: "append" });
    }
    prepend(variable, value) {
        this.variables.set(variable, { value, type: "prepend" });
    }
    get(variable) {
        return this.variables.get(variable);
    }
    forEach(callback) {
        this.variables.forEach((mutator, variable) => callback(variable, mutator, this));
    }
    delete(variable) {
        return this.variables.delete(variable);
    }
    clear() {
        this.variables.clear();
    }
    getScoped(_scope) {
        return this;
    }
}
// ============================================================================
// VSCode enums
// ============================================================================
export var ExtensionMode;
(function (ExtensionMode) {
    ExtensionMode[ExtensionMode["Production"] = 1] = "Production";
    ExtensionMode[ExtensionMode["Development"] = 2] = "Development";
    ExtensionMode[ExtensionMode["Test"] = 3] = "Test";
})(ExtensionMode || (ExtensionMode = {}));
export var ExtensionKind;
(function (ExtensionKind) {
    ExtensionKind[ExtensionKind["UI"] = 1] = "UI";
    ExtensionKind[ExtensionKind["Workspace"] = 2] = "Workspace";
})(ExtensionKind || (ExtensionKind = {}));
export var DiagnosticSeverity;
(function (DiagnosticSeverity) {
    DiagnosticSeverity[DiagnosticSeverity["Error"] = 0] = "Error";
    DiagnosticSeverity[DiagnosticSeverity["Warning"] = 1] = "Warning";
    DiagnosticSeverity[DiagnosticSeverity["Information"] = 2] = "Information";
    DiagnosticSeverity[DiagnosticSeverity["Hint"] = 3] = "Hint";
})(DiagnosticSeverity || (DiagnosticSeverity = {}));
export var EndOfLine;
(function (EndOfLine) {
    EndOfLine[EndOfLine["LF"] = 1] = "LF";
    EndOfLine[EndOfLine["CRLF"] = 2] = "CRLF";
})(EndOfLine || (EndOfLine = {}));
const outputChannelLoggers = new Map();
function getOutputChannelLogger(channelName) {
    let logger = outputChannelLoggers.get(channelName);
    if (!logger) {
        const transport = pino.transport({
            target: "pino-roll",
            options: {
                name: channelName,
                file: CLI_LOG_FILE.replace(".1", ""),
                mkdir: true,
                frequency: "daily",
                limit: { count: 5 },
            },
        });
        logger = pino({ timestamp: pino.stdTimeFunctions.isoTime }, transport);
        outputChannelLoggers.set(channelName, logger);
    }
    return logger;
}
export class Position {
    line;
    character;
    constructor(line, character) {
        this.line = line;
        this.character = character;
    }
    compareTo(other) {
        return this.line - other.line || this.character - other.character;
    }
    isAfter(other) {
        return this.compareTo(other) > 0;
    }
    isAfterOrEqual(other) {
        return this.compareTo(other) >= 0;
    }
    isBefore(other) {
        return this.compareTo(other) < 0;
    }
    isBeforeOrEqual(other) {
        return this.compareTo(other) <= 0;
    }
    isEqual(other) {
        return this.compareTo(other) === 0;
    }
    translate(lineDelta = 0, characterDelta = 0) {
        return new Position(this.line + lineDelta, this.character + characterDelta);
    }
    with(line, character) {
        return new Position(line ?? this.line, character ?? this.character);
    }
}
export class Range {
    start;
    end;
    constructor(startOrStartLine, endOrStartCharacter, endLine, endCharacter) {
        if (typeof startOrStartLine === "number") {
            this.start = new Position(startOrStartLine, endOrStartCharacter);
            this.end = new Position(endLine, endCharacter);
        }
        else {
            this.start = startOrStartLine;
            this.end = endOrStartCharacter;
        }
    }
    get isEmpty() {
        return this.start.isEqual(this.end);
    }
    get isSingleLine() {
        return this.start.line === this.end.line;
    }
    contains(positionOrRange) {
        if (positionOrRange instanceof Range) {
            return this.contains(positionOrRange.start) && this.contains(positionOrRange.end);
        }
        return positionOrRange.isAfterOrEqual(this.start) && positionOrRange.isBeforeOrEqual(this.end);
    }
    isEqual(other) {
        return this.start.isEqual(other.start) && this.end.isEqual(other.end);
    }
    intersection(range) {
        const start = this.start.isAfter(range.start) ? this.start : range.start;
        const end = this.end.isBefore(range.end) ? this.end : range.end;
        return start.isAfter(end) ? undefined : new Range(start, end);
    }
    union(other) {
        const start = this.start.isBefore(other.start) ? this.start : other.start;
        const end = this.end.isAfter(other.end) ? this.end : other.end;
        return new Range(start, end);
    }
    with(start, end) {
        return new Range(start ?? this.start, end ?? this.end);
    }
}
export class Selection extends Range {
    anchor;
    active;
    constructor(anchorOrAnchorLine, activeOrAnchorCharacter, activeLine, activeCharacter) {
        const anchor = typeof anchorOrAnchorLine === "number"
            ? new Position(anchorOrAnchorLine, activeOrAnchorCharacter)
            : anchorOrAnchorLine;
        const active = typeof anchorOrAnchorLine === "number"
            ? new Position(activeLine, activeCharacter)
            : activeOrAnchorCharacter;
        const isForward = anchor.isBefore(active);
        super(isForward ? anchor : active, isForward ? active : anchor);
        this.anchor = anchor;
        this.active = active;
    }
    get isReversed() {
        return this.anchor.isAfter(this.active);
    }
}
export class EventEmitter {
    listeners = [];
    event = (listener) => {
        this.listeners.push(listener);
        return {
            dispose: () => {
                const idx = this.listeners.indexOf(listener);
                if (idx >= 0)
                    this.listeners.splice(idx, 1);
            },
        };
    };
    fire(data) {
        this.listeners.forEach((listener) => listener(data));
    }
    dispose() {
        this.listeners.length = 0;
    }
}
export class Disposable {
    callOnDispose;
    constructor(callOnDispose) {
        this.callOnDispose = callOnDispose;
    }
    static from(...disposables) {
        return new Disposable(() => disposables.forEach((d) => d.dispose()));
    }
    dispose() {
        this.callOnDispose();
    }
}
const noop = () => { };
const noopAsync = async () => { };
const noopDisposable = { dispose: noop };
export const workspace = {
    workspaceFolders: undefined,
    getWorkspaceFolder: (_uri) => undefined,
    onDidChangeWorkspaceFolders: () => noopDisposable,
    fs: {
        readFile: async (_uri) => new Uint8Array(),
        writeFile: noopAsync,
        delete: noopAsync,
        stat: async (_uri) => ({ type: 1, size: 0 }),
        readDirectory: async (_uri) => [],
        createDirectory: noopAsync,
    },
};
export const window = {
    showInformationMessage: async (message) => {
        printInfo(`[INFO] ${message}`);
    },
    showWarningMessage: async (message) => {
        printWarning(`[WARN] ${message}`);
    },
    showErrorMessage: async (message) => {
        printError(`[ERROR] ${message}`);
    },
    createOutputChannel: (name) => {
        const logger = getOutputChannelLogger(name);
        const log = (text) => logger.info({ channel: name }, text);
        return { appendLine: log, append: log, clear: noop, show: noop, hide: noop, dispose: noop };
    },
    terminals: [],
    activeTerminal: undefined,
    createTerminal: (_options) => ({
        name: "CLI Terminal",
        processId: Promise.resolve(process.pid),
        sendText: (text) => printInfo(`[${new Date().toISOString()}] [Terminal] ${text}`),
        show: noop,
        hide: noop,
        dispose: noop,
    }),
};
// ============================================================================
// Shutdown event for graceful cleanup
// ============================================================================
/**
 * Event emitter for app shutdown notification.
 * Components can listen to this to clean up UI before process exit.
 */
export const shutdownEvent = new EventEmitter();
//# sourceMappingURL=vscode-shim.js.map