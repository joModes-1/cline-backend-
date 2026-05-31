import { String as ProtoString } from "@shared/proto/cline/common";
import { OcaAuthState, OcaUserInfo } from "@shared/proto/cline/oca_account";
import { getRequestRegistry } from "@/core/controller/grpc-handler";
import { AuthHandler } from "@/hosts/external/AuthHandler";
import { Logger } from "@/shared/services/Logger";
import { openExternal } from "@/utils/env";
import { LogoutReason } from "../types";
import { OcaAuthProvider } from "./providers/OcaAuthProvider";
import { getOcaConfig } from "./utils/utils";
// import { AuthHandler } from "@/hosts/external/AuthHandler"
export class OcaAuthService {
    static instance = null;
    _config;
    _authenticated = false;
    _ocaAuthState = null;
    _provider = null;
    _controller = null;
    _refreshInFlight = null;
    _interactiveLoginPending = false;
    _activeAuthStatusUpdateSubscriptions = new Set();
    constructor() {
        this._config = getOcaConfig();
        this._provider = new OcaAuthProvider(this._config);
    }
    requireController() {
        if (this._controller) {
            return this._controller;
        }
        throw new Error("Controller has not been initialized");
    }
    requireProvider() {
        if (!this._provider) {
            throw new Error("Auth provider is not set");
        }
        return this._provider;
    }
    /**
     * Initializes the singleton with a Controller.
     * Safe to call multiple times; updates controller on existing instance.
     */
    static initialize(controller) {
        if (!OcaAuthService.instance) {
            OcaAuthService.instance = new OcaAuthService();
        }
        OcaAuthService.instance._controller = controller;
        return OcaAuthService.instance;
    }
    /**
     * Gets the singleton instance of OcaAuthService.
     * Throws if not initialized. Call initialize(controller) first.
     */
    static getInstance() {
        if (!OcaAuthService.instance || !OcaAuthService.instance._controller) {
            throw new Error("OcaAuthService not initialized. Call OcaAuthService.initialize(controller) first.");
        }
        return OcaAuthService.instance;
    }
    /**
     * Returns a current OCA authentication state.
     */
    getInfo() {
        let user;
        if (this._ocaAuthState && this._authenticated) {
            const userInfo = this._ocaAuthState.user;
            user = OcaUserInfo.create({
                uid: userInfo?.uid,
                displayName: userInfo?.displayName,
                email: userInfo?.email,
            });
        }
        return OcaAuthState.create({ user });
    }
    get isAuthenticated() {
        return this._authenticated;
    }
    async refreshAuthState() {
        // Single-flight to avoid concurrent refresh storms
        if (this._refreshInFlight) {
            await this._refreshInFlight;
            return;
        }
        this._refreshInFlight = (async () => {
            try {
                await this.restoreRefreshTokenAndRetrieveAuthInfo();
            }
            finally {
                this._refreshInFlight = null;
            }
        })();
        await this._refreshInFlight;
    }
    async getAuthToken() {
        this.requireController();
        // Ensure we have a state with a token
        if (!this._ocaAuthState || !this._ocaAuthState.apiKey) {
            await this.refreshAuthState();
            return this._ocaAuthState?.apiKey ?? null;
        }
        const apiKey = this._ocaAuthState.apiKey;
        // Check if the token should be refreshed
        let shouldRefresh = false;
        try {
            shouldRefresh = await this.requireProvider().shouldRefreshAccessToken(apiKey);
        }
        catch {
            // If the provider check fails, err on the side of refreshing
            shouldRefresh = true;
        }
        if (shouldRefresh) {
            await this.refreshAuthState();
        }
        return this._ocaAuthState?.apiKey ?? null;
    }
    async createAuthRequest() {
        this.requireController();
        if (this._authenticated) {
            this.sendAuthStatusUpdate();
            return ProtoString.create({ value: "Already authenticated" });
        }
        const ocaMode = this.requireController().stateManager.getGlobalSettingsKey("ocaMode") || "internal";
        const idcsUrl = ocaMode === "external" ? this._config.external.idcs_url : this._config.internal.idcs_url;
        if (!idcsUrl) {
            throw new Error("IDCS URI is not configured");
        }
        // Start the auth handler
        const authHandler = AuthHandler.getInstance();
        authHandler.setEnabled(true);
        const callbackUrl = await authHandler.getCallbackUrl("/auth/oca");
        const authUrl = this.requireProvider().getAuthUrl(callbackUrl, ocaMode);
        const authUrlString = authUrl?.toString() || "";
        if (!authUrlString) {
            throw new Error("Failed to generate authentication URL");
        }
        await openExternal(authUrlString);
        return ProtoString.create({ value: authUrlString });
    }
    async handleDeauth(_ = LogoutReason.UNKNOWN) {
        try {
            this.clearAuth();
            this._ocaAuthState = null;
            this._authenticated = false;
            await this.sendAuthStatusUpdate();
        }
        catch (error) {
            Logger.error("Error signing out:", error);
            throw error;
        }
    }
    clearAuth() {
        const ctrl = this.requireController();
        this.requireProvider().clearAuth(ctrl);
    }
    async handleAuthCallback(code, state) {
        const provider = this.requireProvider();
        const ctrl = this.requireController();
        try {
            this._ocaAuthState = await provider.signIn(ctrl, code, state);
            this._authenticated = true;
            await this.sendAuthStatusUpdate();
        }
        catch (error) {
            Logger.error("Error signing in with custom token:", error);
            throw error;
        }
        finally {
            const authHandler = AuthHandler.getInstance();
            authHandler.setEnabled(false);
        }
    }
    async restoreRefreshTokenAndRetrieveAuthInfo() {
        const provider = this.requireProvider();
        const ctrl = this.requireController();
        try {
            this._ocaAuthState = await provider.retrieveOcaAuthState(ctrl);
            if (this._ocaAuthState) {
                this._authenticated = true;
                await this.sendAuthStatusUpdate();
                return;
            }
            Logger.warn("No user found after restoring auth token");
            await this.kickstartInteractiveLoginAsFallback();
        }
        catch (error) {
            Logger.error("Error restoring auth token:", error);
            await this.kickstartInteractiveLoginAsFallback(error);
        }
    }
    async kickstartInteractiveLoginAsFallback(_err) {
        // Clear any stale secrets and broadcast unauthenticated state
        this.clearAuth();
        this._authenticated = false;
        this._ocaAuthState = null;
        await this.sendAuthStatusUpdate();
        // Avoid repeated/looping login attempts
        if (this._interactiveLoginPending) {
            return;
        }
        this._interactiveLoginPending = true;
        try {
            // Kickstart interactive login (opens browser)
            await this.createAuthRequest();
            // Wait up to 60 seconds for user to complete login
            const timeoutMs = 60_000;
            const pollMs = 250;
            const start = Date.now();
            while (!this._authenticated && Date.now() - start < timeoutMs) {
                await new Promise((r) => setTimeout(r, pollMs));
            }
            if (!this._authenticated) {
                Logger.warn("Interactive OCA login timed out after 120 seconds");
            }
        }
        catch (e) {
            Logger.error("Failed to initiate interactive OCA login:", e);
        }
        finally {
            this._interactiveLoginPending = false;
        }
    }
    async subscribeToAuthStatusUpdate(_request, responseStream, requestId) {
        Logger.log("Subscribing to authStatusUpdate");
        const ctrl = this.requireController();
        if (!this._ocaAuthState) {
            this._ocaAuthState = await this.requireProvider().getExistingAuthState(ctrl);
            this._authenticated = !!this._ocaAuthState;
        }
        const entry = { controller: ctrl, responseStream };
        this._activeAuthStatusUpdateSubscriptions.add(entry);
        const cleanup = () => {
            this._activeAuthStatusUpdateSubscriptions.delete(entry);
        };
        if (requestId) {
            getRequestRegistry().registerRequest(requestId, cleanup, { type: "authStatusUpdate_subscription" }, responseStream);
        }
        try {
            await this.sendAuthStatusUpdate();
        }
        catch (error) {
            Logger.error("Error sending initial auth status:", error);
            this._activeAuthStatusUpdateSubscriptions.delete(entry);
        }
    }
    async sendAuthStatusUpdate() {
        if (this._activeAuthStatusUpdateSubscriptions.size === 0) {
            return;
        }
        const postedControllers = new Set();
        const promises = Array.from(this._activeAuthStatusUpdateSubscriptions).map(async (entry) => {
            const { controller: ctrl, responseStream } = entry;
            try {
                const authInfo = this.getInfo();
                await responseStream(authInfo, false);
                if (ctrl && !postedControllers.has(ctrl)) {
                    postedControllers.add(ctrl);
                    await ctrl.postStateToWebview();
                }
            }
            catch (error) {
                Logger.error("Error sending authStatusUpdate event:", error);
                this._activeAuthStatusUpdateSubscriptions.delete(entry);
            }
        });
        await Promise.all(promises);
    }
}
//# sourceMappingURL=OcaAuthService.js.map