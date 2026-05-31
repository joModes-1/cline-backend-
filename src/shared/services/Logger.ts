/**
 * Simple Logger utility for the extension's backend code.
 */
export class Logger {
	// Always include args in log output so error details (stacks, payloads) aren't silently dropped.
	private static isVerbose = true

	private static subscribers: Set<(msg: string) => void> = new Set()

	private static output(msg: string): void {
		for (const subscriber of Logger.subscribers) {
			try {
				subscriber(msg)
			} catch {
				// ignore errors from subscribers
			}
		}
	}

	/**
	 * Register a callback to receive log output messages.
	 */
	static subscribe(outputFn: (msg: string) => void) {
		Logger.subscribers.add(outputFn)
	}

	static error(message: string, ...args: any[]) {
		Logger.#output("ERROR", message, undefined, args)
	}

	static warn(message: string, ...args: any[]) {
		Logger.#output("WARN", message, undefined, args)
	}

	static log(message: string, ...args: any[]) {
		Logger.#output("LOG", message, undefined, args)
	}

	static debug(message: string, ...args: any[]) {
		Logger.#output("DEBUG", message, undefined, args)
	}

	static info(message: string, ...args: any[]) {
		Logger.#output("INFO", message, undefined, args)
	}

	static trace(message: string, ...args: any[]) {
		Logger.#output("TRACE", message, undefined, args)
	}

	static #output(level: string, message: string, error: Error | undefined, args: any[]) {
		try {
			let fullMessage = message
			if (Logger.isVerbose && args.length > 0) {
				fullMessage += ` ${args.map((arg) => Logger.#stringifyArg(arg)).join(" ")}`
			}
			const errorSuffix = error?.message ? ` ${error.message}` : ""
			Logger.output(`${level} ${fullMessage}${errorSuffix}`.trimEnd())
		} catch {
			// do nothing if Logger fails
		}
	}

	/**
	 * Stringify a log argument. JSON.stringify(new Error()) returns "{}" because
	 * Error props (message, stack, code) are non-enumerable — so errors silently
	 * vanish from logs. Handle Errors and other special cases explicitly.
	 */
	static #stringifyArg(arg: any): string {
		if (arg instanceof Error) {
			const extras: Record<string, any> = {}
			for (const key of Object.getOwnPropertyNames(arg)) {
				if (key !== "message" && key !== "stack" && key !== "name") {
					extras[key] = (arg as any)[key]
				}
			}
			const extrasStr = Object.keys(extras).length > 0 ? ` ${JSON.stringify(extras)}` : ""
			return `${arg.name}: ${arg.message}${extrasStr}\n${arg.stack || ""}`
		}
		if (arg === undefined) return "undefined"
		if (arg === null) return "null"
		if (typeof arg === "string") return arg
		try {
			return JSON.stringify(arg)
		} catch {
			return String(arg)
		}
	}
}
