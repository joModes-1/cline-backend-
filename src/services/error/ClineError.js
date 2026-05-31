import { serializeError } from "serialize-error";
import { CLINE_ACCOUNT_AUTH_ERROR_MESSAGE } from "../../shared/ClineAccount";
export var ClineErrorType;
(function (ClineErrorType) {
    ClineErrorType["Auth"] = "auth";
    ClineErrorType["Network"] = "network";
    ClineErrorType["RateLimit"] = "rateLimit";
    ClineErrorType["Balance"] = "balance";
})(ClineErrorType || (ClineErrorType = {}));
const RATE_LIMIT_PATTERNS = [/status code 429/i, /rate limit/i, /too many requests/i, /quota exceeded/i, /resource exhausted/i];
export class ClineError extends Error {
    modelId;
    providerId;
    title = "ClineError";
    _error;
    // Error details per providers:
    // Cline: error?.error
    // Ollama: error?.cause
    // tbc
    constructor(raw, modelId, providerId) {
        const error = serializeError(raw);
        const message = error.message || error?.response?.message || String(error) || error?.cause?.means;
        super(message);
        this.modelId = modelId;
        this.providerId = providerId;
        // Extract status from multiple possible locations
        const status = error.status || error.statusCode || error.response?.status;
        this.modelId = modelId || error.modelId;
        this.providerId = providerId || error.providerId;
        // Construct the error details object to includes relevant information
        // And ensure it has a consistent structure
        this._error = {
            ...error,
            message: raw.message || message,
            status,
            request_id: error.error?.request_id ||
                error.request_id ||
                error.response?.request_id ||
                error.response?.headers?.["x-request-id"],
            code: error.code || error?.cause?.code,
            modelId: this.modelId,
            providerId: this.providerId,
            details: error.details || error.error, // Additional details provided by the server
            stack: undefined, // Avoid serializing stack trace to keep the error object clean
        };
    }
    /**
     *  Serializes the error to a JSON string that allows for easy transmission and storage.
     *  This is useful for logging or sending error details to a webviews.
     */
    serialize() {
        return JSON.stringify({
            message: this.message,
            status: this._error.status,
            request_id: this._error.request_id,
            code: this._error.code,
            modelId: this.modelId,
            providerId: this.providerId,
            details: this._error.details,
        });
    }
    /**
     * Parses a stringified error into a ClineError instance.
     */
    static parse(errorStr, modelId) {
        if (!errorStr || typeof errorStr !== "string") {
            return undefined;
        }
        return ClineError.transform(errorStr, modelId);
    }
    /**
     * Transforms any object into a ClineError instance.
     * Always returns a ClineError, even if the input is not a valid error object.
     */
    static transform(error, modelId, providerId) {
        try {
            // If already a ClineError, return it directly to prevent infinite recursion
            if (error instanceof ClineError) {
                return error;
            }
            return new ClineError(JSON.parse(error), modelId, providerId);
        }
        catch {
            return new ClineError(error, modelId, providerId);
        }
    }
    isErrorType(type) {
        return ClineError.getErrorType(this) === type;
    }
    /**
     * Is known error type based on the error code, status, and details.
     * This is useful for determining how to handle the error in the UI or logic.
     */
    static getErrorType(err) {
        const { code, status, details } = err._error;
        const message = (err._error?.message || err.message || JSON.stringify(err._error))?.toLowerCase();
        // Check balance error first (most specific)
        if (code === "insufficient_credits" && typeof details?.current_balance === "number") {
            return ClineErrorType.Balance;
        }
        // Check auth errors
        const isAuthStatus = status !== undefined && status > 400 && status < 429;
        if (code === "ERR_BAD_REQUEST" || err instanceof AuthInvalidTokenError || isAuthStatus) {
            return ClineErrorType.Auth;
        }
        if (message) {
            // Check for specific error codes/messages if applicable
            const authErrorRegex = [/(?:in)?valid[-_ ]?(?:api )?(?:token|key)/i, /authentication[-_ ]?failed/i, /unauthorized/i];
            if (message?.includes(CLINE_ACCOUNT_AUTH_ERROR_MESSAGE) || authErrorRegex.some((regex) => regex.test(message))) {
                return ClineErrorType.Auth;
            }
            // Check rate limit patterns
            const lowerMessage = message.toLowerCase();
            if (RATE_LIMIT_PATTERNS.some((pattern) => pattern.test(lowerMessage))) {
                return ClineErrorType.RateLimit;
            }
        }
        return undefined;
    }
}
export class AuthNetworkError extends Error {
    cause;
    constructor(message, cause) {
        super(message);
        this.cause = cause;
        this.name = ClineErrorType.Network;
    }
}
export class AuthInvalidTokenError extends Error {
    constructor(message) {
        super(message);
        this.name = ClineErrorType.Auth;
    }
}
//# sourceMappingURL=ClineError.js.map