import axios from "axios";
import { jwtDecode } from "jwt-decode";
import { getAxiosSettings } from "@/shared/net";
import { Logger } from "@/shared/services/Logger";
import { generateCodeVerifier, generateRandomString, pkceChallengeFromVerifier } from "../utils/utils";
export class OcaRefreshError extends Error {
    status;
    code;
    invalidGrant;
    data;
    constructor(message, status, code, invalidGrant, data) {
        super(message);
        this.name = "OcaRefreshError";
        this.status = status;
        this.code = code;
        this.invalidGrant = invalidGrant;
        this.data = data;
    }
}
export class OcaAuthProvider {
    // Map state -> { code_verifier, nonce, createdAt }
    static pkceStateMap = new Map();
    _config;
    constructor(config) {
        this._config = config || {};
    }
    get config() {
        return this._config;
    }
    set config(value) {
        this._config = value;
    }
    /**
     * Determines if the ID token should be refreshed.
     */
    async shouldRefreshAccessToken(existingAccessToken) {
        const decodedToken = this.decodeJwt(existingAccessToken);
        const exp = decodedToken.exp || 0;
        const expirationTime = exp * 1000;
        const currentTime = Date.now();
        const fiveMinutesInMs = 5 * 60 * 1000;
        return currentTime > expirationTime - fiveMinutesInMs;
    }
    /**
     * Decodes a JWT token.
     * Subclasses can override if the logic differs from standard JWT.
     */
    decodeJwt(token) {
        return jwtDecode(token);
    }
    async getUserAccountInfo(token) {
        const decodedToken = this.decodeJwt(token);
        const subject = decodedToken.sub || "";
        return {
            displayName: subject,
            uid: subject,
            email: subject,
        };
    }
    async getExistingAuthState(controller) {
        const accessToken = controller.stateManager.getSecretKey("ocaApiKey");
        if (accessToken && !(await this.shouldRefreshAccessToken(accessToken))) {
            return { user: await this.getUserAccountInfo(accessToken), apiKey: accessToken };
        }
        return null;
    }
    async retrieveOcaAuthState(controller) {
        // First Check the existing access token
        const existingAuthState = await this.getExistingAuthState(controller);
        if (existingAuthState) {
            return existingAuthState;
        }
        // Otherwise, try to refresh using the refresh token
        const userRefreshToken = controller.stateManager.getSecretKey("ocaRefreshToken");
        if (!userRefreshToken) {
            Logger.error("No stored authentication credential found.");
            return null;
        }
        try {
            const ocaMode = controller.stateManager.getGlobalSettingsKey("ocaMode") || "internal";
            const { idcs_url, client_id } = ocaMode === "internal" ? this._config.internal : this._config.external;
            if (!idcs_url || !client_id) {
                throw new Error("IDCS URL or Client ID are not configured");
            }
            const discovery = await axios.get(`${idcs_url}/.well-known/openid-configuration`, getAxiosSettings());
            const tokenEndpoint = discovery.data.token_endpoint;
            const params = {
                grant_type: "refresh_token",
                refresh_token: userRefreshToken,
                client_id,
            };
            const tokenResponse = await axios.post(tokenEndpoint, new URLSearchParams(params), {
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                ...getAxiosSettings(),
            });
            const accessToken = tokenResponse.data.access_token;
            const refreshToken = tokenResponse.data.refresh_token;
            if (refreshToken) {
                controller.stateManager.setSecret("ocaRefreshToken", refreshToken);
                controller.stateManager.setSecret("ocaApiKey", accessToken);
            }
            else {
                Logger.warn("No refresh token received during OCA token refresh.");
                throw new OcaRefreshError("No refresh token received during OCA token refresh.");
            }
            const userInfo = await this.getUserAccountInfo(accessToken);
            return { user: userInfo, apiKey: accessToken };
        }
        catch (err) {
            const isAxios = axios?.isAxiosError?.(err);
            const status = isAxios ? err.response?.status : undefined;
            const data = isAxios ? err.response?.data : undefined;
            const code = data?.error || (isAxios ? err.code : undefined);
            const desc = data?.error_description || (isAxios ? err.message : undefined);
            const invalidGrant = (status === 400 && code === "invalid_grant") || status === 401;
            Logger.error("OCA refresh failed", { status, code, desc });
            throw new OcaRefreshError(desc || "OCA refresh failed", status, code, invalidGrant, data);
        }
    }
    // Launch authentication flow: returns URL
    getAuthUrl(callbackUrl, ocaMode) {
        const { idcs_url, client_id, scopes } = ocaMode === "internal" ? this._config.internal : this._config.external;
        if (!idcs_url || !client_id || !scopes) {
            throw new Error("IDCS URL, Client ID, or Scopes are not configured");
        }
        const code_verifier = generateCodeVerifier();
        const code_challenge = pkceChallengeFromVerifier(code_verifier);
        const state = generateRandomString(32);
        const nonce = generateRandomString(32);
        // Clean up expired PKCE entries (older than 10min)
        const cutoff = Date.now() - 600_000;
        for (const [key, entry] of OcaAuthProvider.pkceStateMap.entries()) {
            if (entry.createdAt < cutoff) {
                OcaAuthProvider.pkceStateMap.delete(key);
            }
        }
        OcaAuthProvider.pkceStateMap.set(state, { code_verifier, nonce, createdAt: Date.now(), redirect_uri: callbackUrl });
        const base = idcs_url.replace(/\/$/, "") + "/oauth2/v1/authorize";
        const url = new URL(base);
        url.searchParams.set("client_id", client_id);
        url.searchParams.set("response_type", "code");
        url.searchParams.set("scope", scopes);
        url.searchParams.set("code_challenge", code_challenge);
        url.searchParams.set("code_challenge_method", "S256");
        url.searchParams.set("redirect_uri", callbackUrl);
        url.searchParams.set("state", state);
        url.searchParams.set("nonce", nonce);
        return url;
    }
    // signIn expects code and state from the callback!
    async signIn(controller, code, state) {
        try {
            const ocaMode = controller.stateManager.getGlobalSettingsKey("ocaMode") || "internal";
            const { idcs_url, client_id } = ocaMode === "internal" ? this._config.internal : this._config.external;
            if (!idcs_url || !client_id) {
                throw new Error("IDCS URL or Client ID are not configured");
            }
            const entry = OcaAuthProvider.pkceStateMap.get(state);
            if (!entry) {
                throw new Error("No PKCE verifier found for this state (possibly expired or flow not initiated)");
            }
            const { code_verifier, nonce, redirect_uri } = entry;
            OcaAuthProvider.pkceStateMap.delete(state);
            const discovery = await axios.get(`${idcs_url}/.well-known/openid-configuration`, getAxiosSettings());
            const tokenEndpoint = discovery.data.token_endpoint;
            const params = {
                grant_type: "authorization_code",
                code,
                redirect_uri,
                client_id,
                code_verifier,
            };
            const tokenResponse = await axios.post(tokenEndpoint, new URLSearchParams(params), {
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                ...getAxiosSettings(),
            });
            // Step 1: Nonce validation
            const idToken = tokenResponse.data.id_token;
            if (idToken) {
                const decoded = this.decodeJwt(idToken);
                if (decoded.nonce !== nonce) {
                    throw new Error("OIDC nonce verification failed");
                }
            }
            else {
                throw new Error("No ID token received from OCA");
            }
            // Step 2: Get access_token (this is what you'll use for APIs)
            const accessToken = tokenResponse.data.access_token;
            const refreshToken = tokenResponse.data.refresh_token;
            if (refreshToken) {
                controller.stateManager.setSecret("ocaRefreshToken", refreshToken);
                controller.stateManager.setSecret("ocaApiKey", accessToken);
            }
            // Step 3: (Optional) Extract user info from id_token for local profile, not for API
            const userInfo = await this.getUserAccountInfo(idToken);
            // Step 4: Return only the access_token for downstream use
            return { user: userInfo, apiKey: accessToken };
        }
        catch (error) {
            Logger.error("oca sign-in error", "error");
            throw error;
        }
    }
    clearAuth(controller) {
        controller.stateManager.setSecret("ocaApiKey", undefined);
        controller.stateManager.setSecret("ocaRefreshToken", undefined);
        // Clear legacy OCA secrets that may persist from older Cline versions.
        // These are not in SecretKeys (to avoid proto field number changes) but
        // may exist in users' secret storage and cause auth loops if not cleared.
        controller.stateManager.setSecret("ocaAccessToken", undefined);
        controller.stateManager.setSecret("ocaTokenSet", undefined);
    }
}
//# sourceMappingURL=OcaAuthProvider.js.map