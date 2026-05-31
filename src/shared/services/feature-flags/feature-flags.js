export var FeatureFlag;
(function (FeatureFlag) {
    FeatureFlag["WEBTOOLS"] = "webtools";
    FeatureFlag["WORKTREES"] = "worktree-exp";
    // Feature flag for showing the new onboarding flow or old welcome view.
    FeatureFlag["ONBOARDING_MODELS"] = "onboarding_models";
    // Feature flag for remote banner service
    FeatureFlag["REMOTE_BANNERS"] = "remote-banners";
    // Feature flag payload (milliseconds) controlling remote banner cache TTL
    FeatureFlag["EXTENSION_REMOTE_BANNERS_TTL"] = "extension_remote_banners_ttl";
    // Feature flag for DB-backed welcome banners (What's New modal)
    // When off, hardcoded welcome items are shown instead
    FeatureFlag["REMOTE_WELCOME_BANNERS"] = "remote-welcome-banners";
    // Feature flag for upstream Cline recommended model cards
    FeatureFlag["CLINE_RECOMMENDED_MODELS_UPSTREAM"] = "cline-recommended-models-upstream";
    // Rollout flag for Cline provider model sourcing:
    // off => OpenRouter model list, on => Cline endpoint model list.
    FeatureFlag["EXTENSION_CLINE_MODELS_ENDPOINT"] = "extension_cline_models_endpoint";
    // Use the websocket mode for OpenAI native Responses API format
    FeatureFlag["OPENAI_RESPONSES_WEBSOCKET_MODE"] = "openai-responses-websocket-mode";
})(FeatureFlag || (FeatureFlag = {}));
export const FeatureFlagDefaultValue = {
    [FeatureFlag.WEBTOOLS]: false,
    [FeatureFlag.WORKTREES]: false,
    [FeatureFlag.ONBOARDING_MODELS]: process.env.E2E_TEST === "true" ? { models: {} } : undefined,
    [FeatureFlag.REMOTE_BANNERS]: process.env.E2E_TEST === "true" || process.env.IS_DEV === "true",
    [FeatureFlag.EXTENSION_REMOTE_BANNERS_TTL]: 24 * 60 * 60 * 1000,
    [FeatureFlag.REMOTE_WELCOME_BANNERS]: process.env.E2E_TEST === "true" || process.env.IS_DEV === "true",
    [FeatureFlag.CLINE_RECOMMENDED_MODELS_UPSTREAM]: false,
    [FeatureFlag.EXTENSION_CLINE_MODELS_ENDPOINT]: false,
    [FeatureFlag.OPENAI_RESPONSES_WEBSOCKET_MODE]: false,
};
export const FEATURE_FLAGS = Object.values(FeatureFlag);
//# sourceMappingURL=feature-flags.js.map