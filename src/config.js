import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { Environment } from "./shared/config-types";
import { Logger } from "./shared/services/Logger";
export { Environment };
/**
 * Error thrown when the Cline configuration file exists but is invalid.
 * This error prevents Cline from starting to avoid misconfiguration in enterprise environments.
 */
export class ClineConfigurationError extends Error {
    constructor(message) {
        super(message);
        this.name = "ClineConfigurationError";
    }
}
class ClineEndpoint {
    static _instance = null;
    static _initialized = false;
    static _extensionFsPath;
    // On-premise config loaded from file (null if not on-premise)
    onPremiseConfig = null;
    environment = Environment.production;
    // Track if config came from bundled file (enterprise distribution)
    isBundled = false;
    constructor() {
        // Set environment at module load. Use override if provided.
        const _env = process?.env?.CLINE_ENVIRONMENT_OVERRIDE || process?.env?.CLINE_ENVIRONMENT;
        if (_env && Object.values(Environment).includes(_env)) {
            this.environment = _env;
        }
    }
    /**
     * Initializes the ClineEndpoint singleton.
     * Must be called before any other methods.
     * Reads the endpoints.json file if it exists and validates its schema.
     *
     * @param extensionFsPath Path to the extension installation directory (for checking bundled endpoints.json)
     * @throws ClineConfigurationError if the endpoints.json file exists but is invalid
     */
    static async initialize(extensionFsPath) {
        if (ClineEndpoint._initialized) {
            return;
        }
        ClineEndpoint._extensionFsPath = extensionFsPath;
        ClineEndpoint._instance = new ClineEndpoint();
        // Try to load on-premise config from file
        const endpointsConfig = await ClineEndpoint.loadEndpointsFile();
        if (endpointsConfig) {
            ClineEndpoint._instance.onPremiseConfig = endpointsConfig;
            Logger.log("Cline running in self-hosted mode with custom endpoints");
        }
        ClineEndpoint._initialized = true;
    }
    /**
     * Returns true if the ClineEndpoint has been initialized.
     */
    static isInitialized() {
        return ClineEndpoint._initialized;
    }
    /**
     * Checks if Cline is running in self-hosted/on-premise mode.
     * @returns true if in selfHosted mode, or true if not initialized (safety fallback to prevent accidental external calls)
     */
    static isSelfHosted() {
        // Safety fallback: if not initialized, treat as selfHosted
        // to prevent accidental external service calls before configuration is loaded
        if (!ClineEndpoint._initialized) {
            return true;
        }
        return ClineEndpoint.config.environment === Environment.selfHosted;
    }
    /**
     * Returns true if the current configuration was loaded from a bundled endpoints.json file.
     * This indicates an enterprise distribution that should not auto-update.
     * @throws Error if not initialized
     */
    static isBundledConfig() {
        if (!ClineEndpoint._initialized || !ClineEndpoint._instance) {
            throw new Error("ClineEndpoint not initialized. Call ClineEndpoint.initialize() first.");
        }
        return ClineEndpoint._instance.isBundled;
    }
    /**
     * Returns the singleton instance.
     * @throws Error if not initialized
     */
    static get instance() {
        if (!ClineEndpoint._initialized || !ClineEndpoint._instance) {
            throw new Error("ClineEndpoint not initialized. Call ClineEndpoint.initialize() first.");
        }
        return ClineEndpoint._instance;
    }
    /**
     * Static getter for convenient access to the current configuration.
     * @throws Error if not initialized
     */
    static get config() {
        return ClineEndpoint.instance.config();
    }
    /**
     * Returns the path to the endpoints.json configuration file.
     * Located at ~/.cline/endpoints.json
     */
    static getEndpointsFilePath() {
        return path.join(os.homedir(), ".cline", "endpoints.json");
    }
    /**
     * Returns the path to the bundled endpoints.json configuration file.
     * Located in the extension installation directory.
     */
    static getBundledEndpointsFilePath() {
        return path.join(ClineEndpoint._extensionFsPath, "endpoints.json");
    }
    /**
     * Loads and validates the endpoints.json file.
     * Checks bundled location first, then falls back to user directory.
     * Priority: bundled endpoints.json → ~/.cline/endpoints.json → null (standard mode)
     * @returns The validated endpoints config, or null if no file exists
     * @throws ClineConfigurationError if a file exists but is invalid
     */
    static async loadEndpointsFile() {
        // 1. Try bundled file
        const bundledPath = ClineEndpoint.getBundledEndpointsFilePath();
        try {
            await fs.access(bundledPath);
            // File exists, load and validate it
            const fileContent = await fs.readFile(bundledPath, "utf8");
            let data;
            try {
                data = JSON.parse(fileContent);
            }
            catch (parseError) {
                throw new ClineConfigurationError(`Invalid JSON in bundled endpoints configuration file (${bundledPath}): ${parseError instanceof Error ? parseError.message : String(parseError)}`);
            }
            const config = ClineEndpoint.validateEndpointsSchema(data, bundledPath);
            // Mark as bundled enterprise distribution
            ClineEndpoint._instance.isBundled = true;
            return config;
        }
        catch (error) {
            if (error instanceof ClineConfigurationError) {
                throw error;
            }
            // Bundled file doesn't exist or is not accessible, try user file
        }
        // 2. Try ~/.cline/endpoints.json
        const userPath = ClineEndpoint.getEndpointsFilePath();
        try {
            await fs.access(userPath);
        }
        catch {
            // File doesn't exist - not on-premise mode
            return null;
        }
        // File exists, must be valid or we fail
        try {
            const fileContent = await fs.readFile(userPath, "utf8");
            let data;
            try {
                data = JSON.parse(fileContent);
            }
            catch (parseError) {
                throw new ClineConfigurationError(`Invalid JSON in user endpoints configuration file (${userPath}): ${parseError instanceof Error ? parseError.message : String(parseError)}`);
            }
            return ClineEndpoint.validateEndpointsSchema(data, userPath);
        }
        catch (error) {
            if (error instanceof ClineConfigurationError) {
                throw error;
            }
            throw new ClineConfigurationError(`Failed to read user endpoints configuration file (${userPath}): ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /**
     * Validates that the provided data matches the EndpointsFileSchema.
     * All fields must be present and be valid URLs.
     *
     * @param data The parsed JSON data to validate
     * @param filePath The path to the file (for error messages)
     * @returns The validated EndpointsFileSchema
     * @throws ClineConfigurationError if validation fails
     */
    static validateEndpointsSchema(data, filePath) {
        if (typeof data !== "object" || data === null) {
            throw new ClineConfigurationError(`Endpoints configuration file (${filePath}) must contain a JSON object`);
        }
        const obj = data;
        const requiredFields = ["appBaseUrl", "apiBaseUrl", "mcpBaseUrl"];
        const result = {};
        for (const field of requiredFields) {
            const value = obj[field];
            if (value === undefined || value === null) {
                throw new ClineConfigurationError(`Missing required field "${field}" in endpoints configuration file (${filePath})`);
            }
            if (typeof value !== "string") {
                throw new ClineConfigurationError(`Field "${field}" in endpoints configuration file (${filePath}) must be a string`);
            }
            if (!value.trim()) {
                throw new ClineConfigurationError(`Field "${field}" in endpoints configuration file (${filePath}) cannot be empty`);
            }
            // Validate URL format
            try {
                new URL(value);
            }
            catch {
                throw new ClineConfigurationError(`Field "${field}" in endpoints configuration file (${filePath}) must be a valid URL. Got: "${value}"`);
            }
            result[field] = value;
        }
        return result;
    }
    /**
     * Returns the current environment configuration.
     */
    config() {
        return this.getEnvironment();
    }
    /**
     * Sets the current environment.
     * @throws Error if in on-premise mode (environment switching is disabled)
     */
    setEnvironment(env) {
        if (this.onPremiseConfig) {
            throw new Error("Cannot change environment in on-premise mode. Endpoints are configured via ~/.cline/endpoints.json");
        }
        switch (env.toLowerCase()) {
            case "staging":
                this.environment = Environment.staging;
                break;
            case "local":
                this.environment = Environment.local;
                break;
            default:
                this.environment = Environment.production;
                break;
        }
    }
    /**
     * Returns the current environment configuration.
     * If running in on-premise mode, returns the custom endpoints.
     */
    getEnvironment() {
        // On-premise mode: use custom endpoints from file
        if (this.onPremiseConfig) {
            return {
                environment: Environment.selfHosted,
                appBaseUrl: this.onPremiseConfig.appBaseUrl,
                apiBaseUrl: this.onPremiseConfig.apiBaseUrl,
                mcpBaseUrl: this.onPremiseConfig.mcpBaseUrl,
            };
        }
        // Standard mode: use built-in environment URLs
        switch (this.environment) {
            case Environment.staging:
                return {
                    environment: Environment.staging,
                    appBaseUrl: "https://staging-app.cline.bot",
                    apiBaseUrl: "https://core-api.staging.int.cline.bot",
                    mcpBaseUrl: "https://core-api.staging.int.cline.bot/v1/mcp",
                };
            case Environment.local:
                return {
                    environment: Environment.local,
                    appBaseUrl: "http://localhost:3000",
                    apiBaseUrl: "http://localhost:7777",
                    mcpBaseUrl: "https://api.cline.bot/v1/mcp",
                };
            default:
                return {
                    environment: Environment.production,
                    appBaseUrl: "https://app.cline.bot",
                    apiBaseUrl: "https://api.cline.bot",
                    mcpBaseUrl: "https://api.cline.bot/v1/mcp",
                };
        }
    }
}
/**
 * Singleton instance to access the current environment configuration.
 * Usage:
 * - ClineEnv.config() to get the current config.
 * - ClineEnv.setEnvironment(Environment.local) to change the environment.
 *
 * IMPORTANT: ClineEndpoint.initialize() must be called before using ClineEnv.
 */
export const ClineEnv = {
    config: () => ClineEndpoint.config,
    setEnvironment: (env) => ClineEndpoint.instance.setEnvironment(env),
    getEnvironment: () => ClineEndpoint.instance.getEnvironment(),
};
// Export the class for initialization
export { ClineEndpoint };
//# sourceMappingURL=config.js.map