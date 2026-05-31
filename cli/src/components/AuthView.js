/**
 * Auth view component
 * Handles interactive authentication and provider configuration
 */
import { Box, Text, useApp, useInput } from "ink";
import Spinner from "ink-spinner";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { refreshOcaModels } from "@/core/controller/models/refreshOcaModels";
import { StateManager } from "@/core/storage/StateManager";
import { openAiCodexOAuthManager } from "@/integrations/openai-codex/oauth";
import { AuthService } from "@/services/auth/AuthService";
import { openAiCodexDefaultModelId, openRouterDefaultModelId } from "@/shared/api";
import { StringRequest } from "@/shared/proto/cline/common";
import { openExternal } from "@/utils/env";
import { COLORS } from "../constants/colors";
import { useStdinContext } from "../context/StdinContext";
import { useClineFeaturedModels } from "../hooks/useClineFeaturedModels";
import { useOcaAuth } from "../hooks/useOcaAuth";
import { useScrollableList } from "../hooks/useScrollableList";
import { detectImportSources } from "../utils/import-configs";
import { isEnterKey, isMouseEscapeSequence } from "../utils/input";
import { applyBedrockConfig, applyProviderConfig } from "../utils/provider-config";
import { useValidProviders } from "../utils/providers";
import { ApiKeyInput } from "./ApiKeyInput";
import { StaticRobotFrame } from "./AsciiMotionCli";
import { BedrockCustomModelFlow } from "./BedrockCustomModelFlow";
import { BedrockSetup } from "./BedrockSetup";
import { FeaturedModelPicker, getFeaturedModelAtIndex, getFeaturedModelMaxIndex, isBrowseAllSelected, } from "./FeaturedModelPicker";
import { ImportView } from "./ImportView";
import { CUSTOM_MODEL_ID, getDefaultModelId, hasModelPicker, ModelPicker } from "./ModelPicker";
import { OcaEmployeeCheck } from "./OcaEmployeeCheck";
import { getProviderLabel } from "./ProviderPicker";
/**
 * Select component with keyboard navigation
 */
const Select = ({ items, onSelect, label }) => {
    const { isRawModeSupported } = useStdinContext();
    const [selectedIndex, setSelectedIndex] = useState(0);
    useInput((input, key) => {
        if (key.upArrow) {
            setSelectedIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1));
        }
        else if (key.downArrow) {
            setSelectedIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0));
        }
        else if (isEnterKey(input, key)) {
            onSelect(items[selectedIndex].value);
        }
    }, { isActive: isRawModeSupported });
    return (React.createElement(Box, { flexDirection: "column" },
        label && (React.createElement(Text, { bold: true, color: "cyan" }, label)),
        items.map((item, index) => (React.createElement(Box, { key: item.value },
            React.createElement(Text, { color: index === selectedIndex ? COLORS.primaryBlue : undefined },
                index === selectedIndex ? "❯ " : "  ",
                item.label)))),
        React.createElement(Text, { color: "gray" }, "(Use arrow keys to navigate, Enter to select)")));
};
/**
 * Text input component - minimal, just the input field
 */
const TextInput = ({ value, onChange, onSubmit, placeholder, isPassword }) => {
    const { isRawModeSupported } = useStdinContext();
    useInput((input, key) => {
        // Filter out mouse escape sequences
        if (isMouseEscapeSequence(input)) {
            return;
        }
        if (isEnterKey(input, key)) {
            onSubmit(value);
        }
        else if (key.backspace || key.delete) {
            onChange(value.slice(0, -1));
        }
        else if (input && !key.ctrl && !key.meta) {
            onChange(value + input);
        }
    }, { isActive: isRawModeSupported });
    const displayValue = isPassword ? "•".repeat(value.length) : value;
    return (React.createElement(Box, null,
        !displayValue && placeholder ? (React.createElement(Text, { color: "gray" },
            "e.g. ",
            placeholder)) : (React.createElement(Text, { color: "white" }, displayValue || "")),
        React.createElement(Text, { inverse: true }, " ")));
};
export const AuthView = ({ controller, onComplete, onError, onNavigateToWelcome }) => {
    const { exit } = useApp();
    const providers = useValidProviders();
    const [step, setStep] = useState("menu");
    const [selectedProvider, setSelectedProvider] = useState(StateManager.get().getApiConfiguration().actModeApiProvider ||
        StateManager.get().getApiConfiguration().planModeApiProvider ||
        "");
    const [apiKey, setApiKey] = useState("");
    const [modelId, setModelId] = useState("");
    const [baseUrl, setBaseUrl] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    const [providerSearch, setProviderSearch] = useState("");
    const [providerIndex, setProviderIndex] = useState(0);
    const [clineModelIndex, setClineModelIndex] = useState(0);
    const featuredModels = useClineFeaturedModels();
    const [importSources, setImportSources] = useState({ codex: false, opencode: false });
    const [importSource, setImportSource] = useState(null);
    const [bedrockConfig, setBedrockConfig] = useState(null);
    // OCA auth hook - enabled when step is oca_auth
    const handleOcaAuthSuccess = useCallback(async () => {
        await applyProviderConfig({ providerId: "oca", controller });
        // Fetch OCA models from the API - this sets actModeOcaModelId/planModeOcaModelId in state
        await refreshOcaModels(controller, StringRequest.create({ value: "" }));
        const stateManager = StateManager.get();
        stateManager.setGlobalState("welcomeViewCompleted", true);
        await stateManager.flushPendingState();
        setSelectedProvider("oca");
        const actModelId = stateManager.getGlobalSettingsKey("actModeOcaModelId") || "";
        setModelId(actModelId);
        setStep("success");
    }, [controller]);
    const handleOcaAuthError = useCallback((error) => {
        setErrorMessage(error.message);
        setStep("error");
    }, []);
    const { startAuth: initiateOcaAuth } = useOcaAuth({
        controller,
        enabled: step === "oca_auth",
        onSuccess: handleOcaAuthSuccess,
        onError: handleOcaAuthError,
    });
    // Main menu items - conditionally include import options
    const mainMenuItems = useMemo(() => {
        const items = [{ label: "Sign in with Cline", value: "cline_auth" }];
        // Add OpenAI Codex option for ChatGPT subscribers
        items.push({ label: "Sign in with ChatGPT Subscription", value: "openai_codex_auth" });
        // Add import options if detected
        if (importSources.codex) {
            items.push({ label: "Import from Codex CLI", value: "import_codex" });
        }
        if (importSources.opencode) {
            items.push({ label: "Import from OpenCode", value: "import_opencode" });
        }
        items.push({ label: "Use your own API key", value: "configure_byo" });
        items.push({ label: "Exit", value: "exit" });
        return items;
    }, [importSources]);
    // Provider menu items - filtered by search (searches both ID and display name)
    const providerItems = useMemo(() => {
        const search = providerSearch.toLowerCase();
        const filtered = providerSearch
            ? providers.filter((p) => p.toLowerCase().includes(search) || getProviderLabel(p).toLowerCase().includes(search))
            : providers;
        return filtered.map((p) => ({
            label: getProviderLabel(p),
            value: p,
        }));
    }, [providers, providerSearch]);
    // Use shared scrollable list hook for provider windowing
    const TOTAL_PROVIDER_ROWS = 8;
    const { visibleStart: providerVisibleStart, visibleCount: providerVisibleCount, showTopIndicator: showProviderTopIndicator, showBottomIndicator: showProviderBottomIndicator, } = useScrollableList(providerItems.length, providerIndex, TOTAL_PROVIDER_ROWS);
    const visibleProviderItems = useMemo(() => {
        return providerItems.slice(providerVisibleStart, providerVisibleStart + providerVisibleCount);
    }, [providerItems, providerVisibleStart, providerVisibleCount]);
    // Detect import sources on mount
    useEffect(() => {
        setImportSources(detectImportSources());
    }, []);
    // Reset provider index when search changes
    // biome-ignore lint/correctness/useExhaustiveDependencies: we want to reset here
    useEffect(() => {
        setProviderIndex(0);
    }, [providerSearch]);
    // Set default model when entering model step
    useEffect(() => {
        if (step === "modelid" && hasModelPicker(selectedProvider)) {
            setModelId(getDefaultModelId(selectedProvider));
        }
    }, [step, selectedProvider]);
    // Subscribe to auth status updates when in cline_auth step
    useEffect(() => {
        if (step !== "cline_auth") {
            return;
        }
        let cancelled = false;
        // Create a streaming response handler that receives auth state updates
        const responseHandler = async (authState, _isLast) => {
            if (cancelled) {
                return;
            }
            if (authState.user?.email) {
                // Auth succeeded - save configuration and transition to model selection
                await applyProviderConfig({ providerId: "cline", controller });
                setSelectedProvider("cline");
                setModelId(openRouterDefaultModelId);
                setStep("cline_model");
            }
        };
        // Subscribe to auth status updates
        const authService = AuthService.getInstance(controller);
        authService.subscribeToAuthStatusUpdate(controller, {}, responseHandler, `cli-auth-${Date.now()}`);
        return () => {
            cancelled = true;
        };
    }, [step, controller]);
    // Start OpenAI Codex OAuth flow
    const startOpenAiCodexAuth = useCallback(async () => {
        try {
            // Get the authorization URL and start the callback server
            const authUrl = openAiCodexOAuthManager.startAuthorizationFlow();
            // Open browser to authorization URL (uses cross-platform 'open' package)
            await openExternal(authUrl);
            // Wait for the callback
            await openAiCodexOAuthManager.waitForCallback();
            // Success - save configuration
            await applyProviderConfig({ providerId: "openai-codex", controller });
            const stateManager = StateManager.get();
            stateManager.setGlobalState("welcomeViewCompleted", true);
            await stateManager.flushPendingState();
            setSelectedProvider("openai-codex");
            setModelId(openAiCodexDefaultModelId);
            setStep("success");
        }
        catch (error) {
            openAiCodexOAuthManager.cancelAuthorizationFlow();
            setErrorMessage(error instanceof Error ? error.message : String(error));
            setStep("error");
        }
    }, []);
    // Start Cline auth flow
    const startClineAuth = useCallback(async () => {
        try {
            setStep("cline_auth");
            await AuthService.getInstance(controller).createAuthRequest();
        }
        catch (error) {
            setErrorMessage(error instanceof Error ? error.message : String(error));
            setStep("error");
        }
    }, [controller]);
    const startOcaAuth = useCallback(() => {
        setStep("oca_auth");
        initiateOcaAuth();
    }, [initiateOcaAuth]);
    const handleMainMenuSelect = useCallback((value) => {
        if (value === "exit") {
            exit();
            onComplete?.();
        }
        else if (value === "cline_auth") {
            startClineAuth();
        }
        else if (value === "openai_codex_auth") {
            setStep("openai_codex_auth");
            startOpenAiCodexAuth();
        }
        else if (value === "configure_byo") {
            setStep("provider");
        }
        else if (value === "import_codex") {
            setImportSource("codex");
            setStep("import");
        }
        else if (value === "import_opencode") {
            setImportSource("opencode");
            setStep("import");
        }
    }, [exit, onComplete, startClineAuth, startOpenAiCodexAuth]);
    const handleProviderSelect = useCallback((value) => {
        setSelectedProvider(value);
        if (value === "oca") {
            // Show employee check screen before starting auth
            setStep("oca_employee_check");
        }
        else if (value === "openai-codex") {
            setStep("openai_codex_auth");
            startOpenAiCodexAuth();
        }
        else if (value === "bedrock") {
            setStep("bedrock");
        }
        else {
            setStep("apikey");
        }
    }, [startOcaAuth, startOpenAiCodexAuth]);
    const handleApiKeySubmit = useCallback((value) => {
        if (!value.trim() || !selectedProvider) {
            // Don't allow empty
            return;
        }
        // Store in local state - will be saved via StateManager in saveConfiguration
        setApiKey(value);
        setStep("modelid");
    }, [selectedProvider]);
    // Save custom Bedrock ARN configuration with base model for capability detection
    const saveCustomBedrockConfiguration = useCallback(async (arn, baseModelId) => {
        try {
            if (!bedrockConfig) {
                throw new Error("Bedrock configuration is missing");
            }
            await applyBedrockConfig({
                bedrockConfig,
                modelId: arn,
                customModelBaseId: baseModelId,
                controller,
            });
            const stateManager = StateManager.get();
            stateManager.setGlobalState("welcomeViewCompleted", true);
            await stateManager.flushPendingState();
            setStep("success");
        }
        catch (error) {
            setErrorMessage(error instanceof Error ? error.message : String(error));
            setStep("error");
        }
    }, [bedrockConfig, controller]);
    const saveConfiguration = useCallback(async (model, base) => {
        try {
            if (selectedProvider === "bedrock" && bedrockConfig) {
                await applyBedrockConfig({
                    bedrockConfig,
                    modelId: model,
                    controller,
                });
            }
            else {
                await applyProviderConfig({
                    providerId: selectedProvider,
                    apiKey,
                    modelId: model,
                    baseUrl: base,
                    controller,
                });
            }
            const stateManager = StateManager.get();
            stateManager.setGlobalState("welcomeViewCompleted", true);
            await stateManager.flushPendingState();
            setStep("success");
        }
        catch (error) {
            setErrorMessage(error instanceof Error ? error.message : String(error));
            setStep("error");
        }
    }, [selectedProvider, apiKey, bedrockConfig, controller]);
    const handleModelIdSubmit = useCallback((value) => {
        // Intercept "Custom" selection for Bedrock — redirect to custom ARN input flow
        if (value === CUSTOM_MODEL_ID && selectedProvider === "bedrock") {
            setStep("bedrock_custom");
            return;
        }
        if (value.trim()) {
            setModelId(value);
        }
        // Only show baseurl step for OpenAI-like providers
        if (["openai", "openai-native"].includes(selectedProvider)) {
            setStep("baseurl");
        }
        else {
            setStep("saving");
            saveConfiguration(value, "");
        }
    }, [selectedProvider, saveConfiguration]);
    const handleBaseUrlSubmit = useCallback((value) => {
        setBaseUrl(value);
        setStep("saving");
        saveConfiguration(modelId, value);
    }, [modelId, saveConfiguration]);
    const handleClineModelSelect = useCallback((modelId) => {
        setModelId(modelId);
        setStep("saving");
        saveConfiguration(modelId, "");
    }, [saveConfiguration]);
    const handleBedrockComplete = useCallback((config) => {
        setBedrockConfig(config);
        setStep("modelid");
    }, []);
    const handleImportComplete = useCallback(() => {
        setStep("success");
    }, []);
    const handleImportCancel = useCallback(() => {
        setImportSource(null);
        setStep("menu");
    }, []);
    // Auto-navigate to welcome after success (immediate)
    // For quick setup mode (no onNavigateToWelcome), exit the Ink app
    useEffect(() => {
        if (step === "success") {
            if (onNavigateToWelcome) {
                onNavigateToWelcome();
            }
            else {
                // Quick setup mode - exit Ink app after successful configuration
                // The cleanup handler in runInkApp will handle process exit
                exit();
            }
        }
    }, [step, onNavigateToWelcome, exit]);
    // Error screen menu items
    const errorMenuItems = useMemo(() => {
        const items = [{ label: "Try again", value: "retry" }];
        if (onNavigateToWelcome) {
            items.push({ label: "Start a task", value: "welcome" });
        }
        items.push({ label: "Exit", value: "exit" });
        return items;
    }, [onNavigateToWelcome]);
    const handleErrorMenuSelect = useCallback((value) => {
        if (value === "retry") {
            // Reset state and go back to menu
            setErrorMessage("");
            setApiKey("");
            setModelId("");
            setBaseUrl("");
            setSelectedProvider("");
            setStep("menu");
        }
        else if (value === "welcome") {
            onNavigateToWelcome?.();
        }
        else if (value === "exit") {
            onError?.();
            exit();
        }
    }, [onNavigateToWelcome, onError, exit]);
    // Handle going back to previous step
    const goBack = useCallback(() => {
        switch (step) {
            case "provider":
                setProviderSearch("");
                setProviderIndex(0);
                setStep("menu");
                break;
            case "apikey":
                setApiKey("");
                setStep("provider");
                break;
            case "modelid":
                setModelId("");
                // Go back to cline_model if we came from there (Cline provider)
                if (selectedProvider === "cline") {
                    setStep("cline_model");
                }
                else if (selectedProvider === "bedrock") {
                    // Bedrock skips the API key step — go back to Bedrock setup
                    setStep("bedrock");
                }
                else {
                    setStep("apikey");
                }
                break;
            case "baseurl":
                setBaseUrl("");
                setStep("modelid");
                break;
            case "oca_employee_check":
                setStep("provider");
                break;
            case "oca_auth":
                setStep("oca_employee_check");
                break;
            case "cline_auth":
                setStep("menu");
                break;
            case "openai_codex_auth":
                openAiCodexOAuthManager.cancelAuthorizationFlow();
                setStep("menu");
                break;
            case "cline_model":
                setClineModelIndex(0);
                setStep("menu");
                break;
            case "bedrock":
                setBedrockConfig(null);
                setStep("provider");
                break;
            case "import":
                setImportSource(null);
                setStep("menu");
                break;
            case "error":
                setErrorMessage("");
                setStep("menu");
                break;
            // menu, saving, success - no back action
        }
    }, [step, selectedProvider]);
    // Render the auth box content based on current step
    // Note: "menu" step is rendered separately in the main return for proper menuIndex tracking
    const renderAuthContent = () => {
        switch (step) {
            case "provider": {
                return (React.createElement(Box, { flexDirection: "column" },
                    React.createElement(Text, { color: "white" }, "Select a provider"),
                    React.createElement(Text, null, " "),
                    React.createElement(Box, null,
                        React.createElement(Text, { color: "gray" }, "Search: "),
                        React.createElement(Text, { color: "white" }, providerSearch),
                        React.createElement(Text, { inverse: true }, " ")),
                    React.createElement(Text, null, " "),
                    showProviderTopIndicator && React.createElement(Text, { color: "gray" },
                        "... ",
                        providerVisibleStart,
                        " more above"),
                    visibleProviderItems.map((item, i) => {
                        const actualIndex = providerVisibleStart + i;
                        return (React.createElement(Box, { key: item.value },
                            React.createElement(Text, { color: actualIndex === providerIndex ? COLORS.primaryBlue : undefined },
                                actualIndex === providerIndex ? "❯ " : "  ",
                                item.label)));
                    }),
                    showProviderBottomIndicator && (React.createElement(Text, { color: "gray" },
                        "... ",
                        providerItems.length - providerVisibleStart - providerVisibleCount,
                        " more below")),
                    providerItems.length === 0 && React.createElement(Text, { color: "gray" },
                        "No providers match \"",
                        providerSearch,
                        "\""),
                    React.createElement(Text, null, " "),
                    React.createElement(Text, { color: "gray" }, "Type to search, arrows to navigate, Enter to select, Esc to go back")));
            }
            case "apikey":
                return (React.createElement(ApiKeyInput, { isActive: step === "apikey", onCancel: goBack, onChange: setApiKey, onSubmit: handleApiKeySubmit, providerName: getProviderLabel(selectedProvider), value: apiKey }));
            case "modelid":
                // Show model picker for providers with static model lists
                if (hasModelPicker(selectedProvider)) {
                    return (React.createElement(Box, { flexDirection: "column" },
                        React.createElement(Text, { color: "white" }, "Select a model"),
                        React.createElement(Text, null, " "),
                        React.createElement(ModelPicker, { controller: controller, isActive: step === "modelid", onChange: setModelId, onSubmit: handleModelIdSubmit, provider: selectedProvider }),
                        React.createElement(Text, null, " "),
                        React.createElement(Text, { color: "gray" }, "Type to search, arrows to navigate, Enter to select, Esc to go back")));
                }
                // Fall back to text input for providers without static model lists
                return (React.createElement(Box, { flexDirection: "column" },
                    React.createElement(Text, { color: "white" }, "Model ID"),
                    React.createElement(Text, null, " "),
                    React.createElement(Text, { color: "gray" }, "e.g., claude-sonnet-4-6, gpt-4o"),
                    React.createElement(Text, null, " "),
                    React.createElement(TextInput, { onChange: setModelId, onSubmit: handleModelIdSubmit, placeholder: "model-id", value: modelId }),
                    React.createElement(Text, null, " "),
                    React.createElement(Text, { color: "gray" }, "Enter to continue, Esc to go back")));
            case "baseurl":
                return (React.createElement(Box, { flexDirection: "column" },
                    React.createElement(Text, { color: "white" }, "Base URL (optional)"),
                    React.createElement(Text, null, " "),
                    React.createElement(Text, { color: "gray" }, "For self-hosted or proxy endpoints"),
                    React.createElement(Text, null, " "),
                    React.createElement(TextInput, { onChange: setBaseUrl, onSubmit: handleBaseUrlSubmit, placeholder: "https://api.example.com/v1", value: baseUrl }),
                    React.createElement(Text, null, " "),
                    React.createElement(Text, { color: "gray" }, "Enter to skip or continue, Esc to go back")));
            case "saving":
                return (React.createElement(Box, null,
                    React.createElement(Text, { color: COLORS.primaryBlue },
                        React.createElement(Spinner, { type: "dots" })),
                    React.createElement(Text, { color: "white" }, " Saving configuration...")));
            case "oca_employee_check":
                return React.createElement(OcaEmployeeCheck, { isActive: step === "oca_employee_check", onCancel: goBack, onSignIn: startOcaAuth });
            case "oca_auth":
            case "cline_auth":
                return (React.createElement(Box, { flexDirection: "column" },
                    React.createElement(Box, null,
                        React.createElement(Text, { color: COLORS.primaryBlue },
                            React.createElement(Spinner, { type: "dots" })),
                        React.createElement(Text, { color: "white" }, " Waiting for browser sign-in...")),
                    React.createElement(Text, null, " "),
                    React.createElement(Text, { color: "gray" }, "Complete sign-in in your browser, then return here."),
                    React.createElement(Text, null, " "),
                    React.createElement(Text, { color: "gray" }, "Esc to cancel")));
            case "openai_codex_auth":
                return (React.createElement(Box, { flexDirection: "column" },
                    React.createElement(Box, null,
                        React.createElement(Text, { color: COLORS.primaryBlue },
                            React.createElement(Spinner, { type: "dots" })),
                        React.createElement(Text, { color: "white" }, " Waiting for ChatGPT sign-in...")),
                    React.createElement(Text, null, " "),
                    React.createElement(Text, { color: "gray" }, "Sign in with your ChatGPT account in the browser."),
                    React.createElement(Text, { color: "gray" }, "Requires ChatGPT Plus, Pro, or Team subscription."),
                    React.createElement(Text, null, " "),
                    React.createElement(Text, { color: "gray" }, "Esc to cancel")));
            case "cline_model": {
                return (React.createElement(Box, { flexDirection: "column" },
                    React.createElement(Text, { color: "white" }, "Choose a model"),
                    React.createElement(Text, null, " "),
                    React.createElement(FeaturedModelPicker, { featuredModels: featuredModels, selectedIndex: clineModelIndex })));
            }
            case "bedrock":
                return (React.createElement(BedrockSetup, { isActive: step === "bedrock", onCancel: () => {
                        setBedrockConfig(null);
                        setStep("provider");
                    }, onComplete: handleBedrockComplete }));
            case "bedrock_custom":
                return (React.createElement(BedrockCustomModelFlow, { isActive: step === "bedrock_custom", onCancel: () => setStep("modelid"), onComplete: (arn, baseModelId) => {
                        setStep("saving");
                        saveCustomBedrockConfiguration(arn, baseModelId);
                    } }));
            case "import":
                if (!importSource) {
                    return null;
                }
                return React.createElement(ImportView, { onCancel: handleImportCancel, onComplete: handleImportComplete, source: importSource });
            case "error":
                return (React.createElement(Box, { flexDirection: "column" },
                    React.createElement(Text, { bold: true, color: "red" }, "Something went wrong"),
                    React.createElement(Text, null, " "),
                    React.createElement(Text, { color: "yellow" }, errorMessage),
                    React.createElement(Text, null, " "),
                    React.createElement(Select, { items: errorMenuItems, onSelect: handleErrorMenuSelect })));
            default:
                return null;
        }
    };
    // For menu step, we need to handle input at the top level
    const { isRawModeSupported } = useStdinContext();
    const [menuIndex, setMenuIndex] = useState(0);
    // Steps that allow going back with escape (apikey handled by ApiKeyInput component)
    // OcaEmployeeCheck handles its own escape key, so oca_employee_check is not in this list
    const canGoBack = [
        "provider",
        "modelid",
        "baseurl",
        "cline_auth",
        "oca_auth",
        "cline_model",
        "openai_codex_auth",
        "bedrock",
        "error",
    ].includes(step);
    useInput((input, key) => {
        // Handle escape to go back (except on menu)
        if (key.escape && canGoBack) {
            goBack();
            return;
        }
        if (step === "menu") {
            if (key.upArrow) {
                setMenuIndex((prev) => (prev > 0 ? prev - 1 : mainMenuItems.length - 1));
            }
            else if (key.downArrow) {
                setMenuIndex((prev) => (prev < mainMenuItems.length - 1 ? prev + 1 : 0));
            }
            else if (isEnterKey(input, key)) {
                handleMainMenuSelect(mainMenuItems[menuIndex].value);
            }
        }
        else if (step === "provider") {
            if (key.upArrow) {
                setProviderIndex((prev) => (prev > 0 ? prev - 1 : providerItems.length - 1));
            }
            else if (key.downArrow) {
                setProviderIndex((prev) => (prev < providerItems.length - 1 ? prev + 1 : 0));
            }
            else if (isEnterKey(input, key)) {
                if (providerItems[providerIndex]) {
                    handleProviderSelect(providerItems[providerIndex].value);
                }
            }
            else if (key.backspace || key.delete) {
                setProviderSearch((prev) => prev.slice(0, -1));
            }
            else if (input && !key.ctrl && !key.meta) {
                setProviderSearch((prev) => prev + input);
            }
        }
        else if (step === "cline_model") {
            const maxIndex = getFeaturedModelMaxIndex(featuredModels);
            if (key.upArrow) {
                setClineModelIndex((prev) => (prev > 0 ? prev - 1 : maxIndex));
            }
            else if (key.downArrow) {
                setClineModelIndex((prev) => (prev < maxIndex ? prev + 1 : 0));
            }
            else if (isEnterKey(input, key)) {
                if (isBrowseAllSelected(clineModelIndex, featuredModels)) {
                    setStep("modelid");
                }
                else {
                    const selectedModel = getFeaturedModelAtIndex(clineModelIndex, featuredModels);
                    if (selectedModel) {
                        handleClineModelSelect(selectedModel.id);
                    }
                }
            }
        }
        // Note: modelid step input is handled by ModelPicker component
    }, { isActive: isRawModeSupported && (step === "menu" || step === "provider" || step === "cline_model" || canGoBack) });
    return (React.createElement(Box, { flexDirection: "column", paddingLeft: 1, paddingRight: 1, width: "100%" },
        React.createElement(StaticRobotFrame, null),
        React.createElement(Box, { justifyContent: "center", marginTop: 1 },
            React.createElement(Text, { bold: true, color: "white" }, "Welcome to Cline")),
        React.createElement(Box, { borderColor: "gray", borderStyle: "round", flexDirection: "column", marginTop: 1, paddingBottom: 1, paddingLeft: 2, paddingRight: 2, paddingTop: 1 }, step === "menu" ? (React.createElement(Box, { flexDirection: "column" },
            React.createElement(Text, { color: "gray" }, "How would you like to get started?"),
            React.createElement(Text, null, " "),
            mainMenuItems.map((item, index) => (React.createElement(Box, { key: item.value },
                React.createElement(Text, null,
                    React.createElement(Text, { color: index === menuIndex ? COLORS.primaryBlue : undefined },
                        index === menuIndex ? "❯ " : "  ",
                        item.label),
                    item.value === "cline_auth" && React.createElement(Text, { color: "yellow" }, " (try Opus 4.6!)"))))),
            React.createElement(Text, null, " "),
            React.createElement(Text, { color: "gray" }, "Use arrow keys, Enter to select"))) : (renderAuthContent()))));
};
//# sourceMappingURL=AuthView.js.map