/**
 * Simple Logger utility for the extension's backend code.
 */
export class Logger {
    // Always include args in log output so error details (stacks, payloads) aren't silently dropped.
    static isVerbose = true;
    static subscribers = new Set();
    static output(msg) {
        for (const subscriber of Logger.subscribers) {
            try {
                subscriber(msg);
            }
            catch {
                // ignore errors from subscribers
            }
        }
    }
    /**
     * Register a callback to receive log output messages.
     */
    static subscribe(outputFn) {
        Logger.subscribers.add(outputFn);
    }
    static error(message, ...args) {
        Logger.#output("ERROR", message, undefined, args);
    }
    static warn(message, ...args) {
        Logger.#output("WARN", message, undefined, args);
    }
    static log(message, ...args) {
        Logger.#output("LOG", message, undefined, args);
    }
    static debug(message, ...args) {
        Logger.#output("DEBUG", message, undefined, args);
    }
    static info(message, ...args) {
        Logger.#output("INFO", message, undefined, args);
    }
    static trace(message, ...args) {
        Logger.#output("TRACE", message, undefined, args);
    }
    static #output(level, message, error, args) {
        try {
            let fullMessage = message;
            if (Logger.isVerbose && args.length > 0) {
                fullMessage += ` ${args.map((arg) => Logger.#stringifyArg(arg)).join(" ")}`;
            }
            const errorSuffix = error?.message ? ` ${error.message}` : "";
            Logger.output(`${level} ${fullMessage}${errorSuffix}`.trimEnd());
        }
        catch {
            // do nothing if Logger fails
        }
    }
    /**
     * Stringify a log argument. JSON.stringify(new Error()) returns "{}" because
     * Error props (message, stack, code) are non-enumerable — so errors silently
     * vanish from logs. Handle Errors and other special cases explicitly.
     */
    static #stringifyArg(arg) {
        if (arg instanceof Error) {
            const extras = {};
            for (const key of Object.getOwnPropertyNames(arg)) {
                if (key !== "message" && key !== "stack" && key !== "name") {
                    extras[key] = arg[key];
                }
            }
            const extrasStr = Object.keys(extras).length > 0 ? ` ${JSON.stringify(extras)}` : "";
            return `${arg.name}: ${arg.message}${extrasStr}\n${arg.stack || ""}`;
        }
        if (arg === undefined)
            return "undefined";
        if (arg === null)
            return "null";
        if (typeof arg === "string")
            return arg;
        try {
            return JSON.stringify(arg);
        }
        catch {
            return String(arg);
        }
    }
}
//# sourceMappingURL=Logger.js.map