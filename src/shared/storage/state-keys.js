import { DEFAULT_AUTO_APPROVAL_SETTINGS } from "@shared/AutoApprovalSettings";
import { DEFAULT_API_PROVIDER, } from "@shared/api";
import { DEFAULT_BROWSER_SETTINGS } from "@shared/BrowserSettings";
import { DEFAULT_FOCUS_CHAIN_SETTINGS } from "@shared/FocusChainSettings";
import { DEFAULT_MCP_DISPLAY_MODE } from "@shared/McpDisplayMode";
const REMOTE_CONFIG_EXTRA_FIELDS = {
    remoteConfiguredProviders: { default: [] },
    allowedMCPServers: { default: [] },
    remoteMCPServers: { default: undefined },
    previousRemoteMCPServers: { default: undefined },
    remoteGlobalRules: { default: undefined },
    remoteGlobalWorkflows: { default: undefined },
    blockPersonalRemoteMCPServers: { default: false },
    openTelemetryOtlpHeaders: { default: undefined },
    otlpMetricsHeaders: { default: undefined },
    otlpLogsHeaders: { default: undefined },
    blobStoreConfig: { default: undefined },
    configuredApiKeys: { default: {} },
};
const GLOBAL_STATE_FIELDS = {
    clineVersion: { default: undefined },
    "cline.generatedMachineId": { default: undefined }, // Note, distinctId reads/writes this directly from/to StorageContext before StateManager is initialized.
    lastShownAnnouncementId: { default: undefined },
    taskHistory: { default: [], isAsync: true },
    userInfo: { default: undefined },
    favoritedModelIds: { default: [] },
    mcpMarketplaceEnabled: { default: true },
    mcpResponsesCollapsed: { default: false },
    terminalReuseEnabled: { default: true },
    vscodeTerminalExecutionMode: {
        default: "vscodeTerminal",
    },
    isNewUser: { default: true },
    welcomeViewCompleted: { default: undefined },
    mcpDisplayMode: { default: DEFAULT_MCP_DISPLAY_MODE },
    workspaceRoots: { default: undefined },
    primaryRootIndex: { default: 0 },
    multiRootEnabled: { default: true },
    lastDismissedInfoBannerVersion: { default: 0 },
    lastDismissedModelBannerVersion: { default: 0 },
    lastDismissedCliBannerVersion: { default: 0 },
    nativeToolCallEnabled: { default: true },
    remoteRulesToggles: { default: {} },
    remoteWorkflowToggles: { default: {} },
    dismissedBanners: { default: [] },
    // Path to worktree that should auto-open Cline sidebar when launched
    worktreeAutoOpenPath: { default: undefined },
};
// Fields that map directly to ApiHandlerOptions in @shared/api.ts
const API_HANDLER_SETTINGS_FIELDS = {
    // Global configuration (not mode-specific)
    liteLlmBaseUrl: { default: undefined },
    liteLlmUsePromptCache: { default: undefined },
    openAiHeaders: { default: {} },
    anthropicBaseUrl: { default: undefined },
    openRouterProviderSorting: { default: undefined },
    awsRegion: { default: undefined },
    awsUseCrossRegionInference: { default: undefined },
    awsUseGlobalInference: { default: undefined },
    awsBedrockUsePromptCache: { default: undefined },
    awsAuthentication: { default: undefined },
    awsUseProfile: { default: undefined },
    awsProfile: { default: undefined },
    awsBedrockEndpoint: { default: undefined },
    claudeCodePath: { default: undefined },
    vertexProjectId: { default: undefined },
    vertexRegion: { default: undefined },
    openAiBaseUrl: { default: undefined },
    ollamaBaseUrl: { default: undefined },
    ollamaApiOptionsCtxNum: { default: undefined },
    lmStudioBaseUrl: { default: undefined },
    lmStudioMaxTokens: { default: undefined },
    geminiBaseUrl: { default: undefined },
    requestyBaseUrl: { default: undefined },
    fireworksModelMaxCompletionTokens: { default: undefined },
    fireworksModelMaxTokens: { default: undefined },
    qwenCodeOauthPath: { default: undefined },
    azureApiVersion: { default: undefined },
    azureIdentity: { default: undefined },
    qwenApiLine: { default: undefined },
    moonshotApiLine: { default: undefined },
    asksageApiUrl: { default: undefined },
    requestTimeoutMs: { default: undefined },
    sapAiResourceGroup: { default: undefined },
    sapAiCoreTokenUrl: { default: undefined },
    sapAiCoreBaseUrl: { default: undefined },
    sapAiCoreUseOrchestrationMode: { default: true },
    difyBaseUrl: { default: undefined },
    zaiApiLine: { default: undefined },
    ocaBaseUrl: { default: undefined },
    minimaxApiLine: { default: undefined },
    ocaMode: { default: "internal" },
    aihubmixBaseUrl: { default: undefined },
    aihubmixAppCode: { default: undefined },
    enableParallelToolCalling: { default: true },
    // Plan mode configurations
    planModeApiModelId: { default: undefined },
    planModeThinkingBudgetTokens: { default: undefined },
    geminiPlanModeThinkingLevel: { default: undefined },
    planModeReasoningEffort: { default: undefined },
    planModeVerbosity: { default: undefined },
    planModeVsCodeLmModelSelector: { default: undefined },
    planModeAwsBedrockCustomSelected: { default: undefined },
    planModeAwsBedrockCustomModelBaseId: { default: undefined },
    planModeOpenRouterModelId: { default: undefined },
    planModeOpenRouterModelInfo: { default: undefined },
    planModeClineModelId: { default: undefined },
    planModeClineModelInfo: { default: undefined },
    planModeOpenAiModelId: { default: undefined },
    planModeOpenAiModelInfo: { default: undefined },
    planModeOllamaModelId: { default: undefined },
    planModeLmStudioModelId: { default: undefined },
    planModeLiteLlmModelId: { default: undefined },
    planModeLiteLlmModelInfo: { default: undefined },
    planModeRequestyModelId: { default: undefined },
    planModeRequestyModelInfo: { default: undefined },
    planModeTogetherModelId: { default: undefined },
    planModeFireworksModelId: { default: undefined },
    planModeSapAiCoreModelId: { default: undefined },
    planModeSapAiCoreDeploymentId: { default: undefined },
    planModeGroqModelId: { default: undefined },
    planModeGroqModelInfo: { default: undefined },
    planModeBasetenModelId: { default: undefined },
    planModeBasetenModelInfo: { default: undefined },
    planModeHuggingFaceModelId: { default: undefined },
    planModeHuggingFaceModelInfo: { default: undefined },
    planModeHuaweiCloudMaasModelId: { default: undefined },
    planModeHuaweiCloudMaasModelInfo: { default: undefined },
    planModeOcaModelId: { default: undefined },
    planModeOcaModelInfo: { default: undefined },
    planModeOcaReasoningEffort: { default: undefined },
    planModeAihubmixModelId: { default: undefined },
    planModeAihubmixModelInfo: { default: undefined },
    planModeHicapModelId: { default: undefined },
    planModeHicapModelInfo: { default: undefined },
    planModeNousResearchModelId: { default: undefined },
    planModeVercelAiGatewayModelId: { default: undefined },
    planModeVercelAiGatewayModelInfo: { default: undefined },
    // Act mode configurations
    actModeApiModelId: { default: undefined },
    actModeThinkingBudgetTokens: { default: undefined },
    geminiActModeThinkingLevel: { default: undefined },
    actModeReasoningEffort: { default: undefined },
    actModeVerbosity: { default: undefined },
    actModeVsCodeLmModelSelector: { default: undefined },
    actModeAwsBedrockCustomSelected: { default: undefined },
    actModeAwsBedrockCustomModelBaseId: { default: undefined },
    actModeOpenRouterModelId: { default: undefined },
    actModeOpenRouterModelInfo: { default: undefined },
    actModeClineModelId: { default: undefined },
    actModeClineModelInfo: { default: undefined },
    actModeOpenAiModelId: { default: undefined },
    actModeOpenAiModelInfo: { default: undefined },
    actModeOllamaModelId: { default: undefined },
    actModeLmStudioModelId: { default: undefined },
    actModeLiteLlmModelId: { default: undefined },
    actModeLiteLlmModelInfo: { default: undefined },
    actModeRequestyModelId: { default: undefined },
    actModeRequestyModelInfo: { default: undefined },
    actModeTogetherModelId: { default: undefined },
    actModeFireworksModelId: { default: undefined },
    actModeSapAiCoreModelId: { default: undefined },
    actModeSapAiCoreDeploymentId: { default: undefined },
    actModeGroqModelId: { default: undefined },
    actModeGroqModelInfo: { default: undefined },
    actModeBasetenModelId: { default: undefined },
    actModeBasetenModelInfo: { default: undefined },
    actModeHuggingFaceModelId: { default: undefined },
    actModeHuggingFaceModelInfo: { default: undefined },
    actModeHuaweiCloudMaasModelId: { default: undefined },
    actModeHuaweiCloudMaasModelInfo: { default: undefined },
    actModeOcaModelId: { default: undefined },
    actModeOcaModelInfo: { default: undefined },
    actModeOcaReasoningEffort: { default: undefined },
    actModeAihubmixModelId: { default: undefined },
    actModeAihubmixModelInfo: { default: undefined },
    actModeHicapModelId: { default: undefined },
    actModeHicapModelInfo: { default: undefined },
    actModeNousResearchModelId: { default: undefined },
    actModeVercelAiGatewayModelId: { default: undefined },
    actModeVercelAiGatewayModelInfo: { default: undefined },
    // Model-specific settings
    planModeApiProvider: { default: DEFAULT_API_PROVIDER },
    actModeApiProvider: { default: DEFAULT_API_PROVIDER },
    // Deprecated model settings
    hicapModelId: { default: undefined },
    lmStudioModelId: { default: undefined },
};
const USER_SETTINGS_FIELDS = {
    // Settings that are NOT part of ApiHandlerOptions
    autoApprovalSettings: {
        default: DEFAULT_AUTO_APPROVAL_SETTINGS,
    },
    globalClineRulesToggles: { default: {} },
    globalWorkflowToggles: { default: {} },
    globalSkillsToggles: { default: {} },
    browserSettings: {
        default: DEFAULT_BROWSER_SETTINGS,
        transform: (v) => ({ ...DEFAULT_BROWSER_SETTINGS, ...v }),
    },
    telemetrySetting: { default: "unset" },
    planActSeparateModelsSetting: { default: false, isComputed: true },
    enableCheckpointsSetting: { default: true },
    shellIntegrationTimeout: { default: 4000 },
    defaultTerminalProfile: { default: "default" },
    terminalOutputLineLimit: { default: 500 },
    maxConsecutiveMistakes: { default: 3 },
    strictPlanModeEnabled: { default: false },
    hooksEnabled: { default: true },
    yoloModeToggled: { default: false },
    autoApproveAllToggled: { default: false },
    useAutoCondense: { default: false },
    subagentsEnabled: { default: false },
    clineWebToolsEnabled: { default: true },
    worktreesEnabled: { default: false },
    preferredLanguage: { default: "English" },
    mode: { default: "act" },
    focusChainSettings: { default: DEFAULT_FOCUS_CHAIN_SETTINGS },
    customPrompt: { default: undefined },
    backgroundEditEnabled: { default: false },
    optOutOfRemoteConfig: { default: false },
    doubleCheckCompletionEnabled: { default: false },
    // OpenTelemetry configuration
    openTelemetryEnabled: { default: true },
    openTelemetryMetricsExporter: { default: undefined },
    openTelemetryLogsExporter: { default: undefined },
    openTelemetryOtlpProtocol: { default: "http/json" },
    openTelemetryOtlpEndpoint: { default: "http://localhost:4318" },
    openTelemetryOtlpMetricsProtocol: { default: undefined },
    openTelemetryOtlpMetricsEndpoint: { default: undefined },
    openTelemetryOtlpLogsProtocol: { default: undefined },
    openTelemetryOtlpLogsEndpoint: { default: undefined },
    openTelemetryMetricExportInterval: { default: 60000 },
    openTelemetryOtlpInsecure: { default: false },
    openTelemetryLogBatchSize: { default: 512 },
    openTelemetryLogBatchTimeout: { default: 5000 },
    openTelemetryLogMaxQueueSize: { default: 2048 },
};
const SETTINGS_FIELDS = { ...API_HANDLER_SETTINGS_FIELDS, ...USER_SETTINGS_FIELDS };
const GLOBAL_STATE_AND_SETTINGS_FIELDS = { ...GLOBAL_STATE_FIELDS, ...SETTINGS_FIELDS };
// ============================================================================
// SECRET KEYS AND LOCAL STATE - Static definitions
// ============================================================================
// Secret keys used in Api Configuration
const SECRETS_KEYS = [
    "apiKey",
    "clineApiKey",
    "clineAccountId", // Cline Account ID for Firebase
    "cline:clineAccountId",
    "openRouterApiKey",
    "awsAccessKey",
    "awsSecretKey",
    "awsSessionToken",
    "awsBedrockApiKey",
    "openAiApiKey",
    "geminiApiKey",
    "openAiNativeApiKey",
    "ollamaApiKey",
    "deepSeekApiKey",
    "requestyApiKey",
    "togetherApiKey",
    "fireworksApiKey",
    "qwenApiKey",
    "doubaoApiKey",
    "mistralApiKey",
    "liteLlmApiKey",
    "authNonce",
    "asksageApiKey",
    "xaiApiKey",
    "moonshotApiKey",
    "zaiApiKey",
    "huggingFaceApiKey",
    "nebiusApiKey",
    "sambanovaApiKey",
    "cerebrasApiKey",
    "sapAiCoreClientId",
    "sapAiCoreClientSecret",
    "groqApiKey",
    "huaweiCloudMaasApiKey",
    "basetenApiKey",
    "vercelAiGatewayApiKey",
    "difyApiKey",
    "minimaxApiKey",
    "hicapApiKey",
    "aihubmixApiKey",
    "nousResearchApiKey",
    "remoteLiteLlmApiKey",
    "ocaApiKey",
    "ocaRefreshToken",
    "mcpOAuthSecrets",
    "openai-codex-oauth-credentials", // JSON blob containing OAuth tokens for OpenAI Codex (ChatGPT subscription)
    "wandbApiKey",
];
// WARNING, these are not ALL of the local state keys in practice. For example, FileContextTracker
// uses dynamic keys like pendingFileContextWarning_${taskId}.
export const LocalStateKeys = [
    "localClineRulesToggles",
    "localCursorRulesToggles",
    "localWindsurfRulesToggles",
    "localAgentsRulesToggles",
    "localSkillsToggles",
    "workflowToggles",
];
// ============================================================================
// GENERATED KEYS AND LOOKUP SETS - Auto-generated from property definitions
// ============================================================================
const GlobalStateKeys = new Set(Object.keys(GLOBAL_STATE_FIELDS));
const SettingsKeysSet = new Set(Object.keys(SETTINGS_FIELDS));
const GlobalStateAndSettingsKeySet = new Set(Object.keys(GLOBAL_STATE_AND_SETTINGS_FIELDS));
const ApiHandlerSettingsKeysSet = new Set(Object.keys(API_HANDLER_SETTINGS_FIELDS));
export const SecretKeys = Array.from(SECRETS_KEYS);
export const SettingsKeys = Array.from(SettingsKeysSet);
export const ApiHandlerSettingsKeys = Array.from(ApiHandlerSettingsKeysSet);
export const GlobalStateAndSettingKeys = Array.from(GlobalStateAndSettingsKeySet);
// GENERATED DEFAULTS - Auto-generated from property definitions
// ============================================================================
export const GLOBAL_STATE_DEFAULTS = extractDefaults(GLOBAL_STATE_FIELDS);
export const SETTINGS_DEFAULTS = extractDefaults(SETTINGS_FIELDS);
export const SETTINGS_TRANSFORMS = extractTransforms(SETTINGS_FIELDS);
export const ASYNC_PROPERTIES = extractMetadata({ ...GLOBAL_STATE_FIELDS, ...SETTINGS_FIELDS }, "isAsync");
export const COMPUTED_PROPERTIES = extractMetadata({ ...GLOBAL_STATE_FIELDS, ...SETTINGS_FIELDS }, "isComputed");
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
export const isGlobalStateKey = (key) => GlobalStateKeys.has(key);
export const isSettingsKey = (key) => SettingsKeysSet.has(key);
export const isSecretKey = (key) => new Set(SECRETS_KEYS).has(key);
export const isLocalStateKey = (key) => new Set(LocalStateKeys).has(key);
// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
export const isAsyncProperty = (key) => ASYNC_PROPERTIES.has(key);
export const isComputedProperty = (key) => COMPUTED_PROPERTIES.has(key);
export const getDefaultValue = (key) => {
    return (GLOBAL_STATE_DEFAULTS[key] ?? SETTINGS_DEFAULTS[key]);
};
export const hasTransform = (key) => key in SETTINGS_TRANSFORMS;
export const applyTransform = (key, value) => {
    const transform = SETTINGS_TRANSFORMS[key];
    return transform ? transform(value) : value;
};
function extractDefaults(props) {
    return Object.fromEntries(Object.entries(props)
        .map(([key, prop]) => [key, prop.default])
        .filter(([_, value]) => value !== undefined));
}
function extractTransforms(props) {
    return Object.fromEntries(Object.entries(props)
        .filter(([_, prop]) => "transform" in prop && prop.transform !== undefined)
        .map(([key, prop]) => [key, prop.transform]));
}
function extractMetadata(props, field) {
    return new Set(Object.entries(props)
        .filter(([_, prop]) => field in prop && prop[field] === true)
        .map(([key]) => key));
}
//# sourceMappingURL=state-keys.js.map