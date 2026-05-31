/**
 * Action types that can be triggered from banner buttons/links
 * Frontend maps these to actual handlers
 */
export var BannerActionType;
(function (BannerActionType) {
    /** Open external URL */
    BannerActionType["Link"] = "link";
    /** Open API settings tab */
    BannerActionType["ShowApiSettings"] = "show-api-settings";
    /** Open feature settings tab */
    BannerActionType["ShowFeatureSettings"] = "show-feature-settings";
    /** Open account/login view */
    BannerActionType["ShowAccount"] = "show-account";
    /** Set the active model */
    BannerActionType["SetModel"] = "set-model";
    /** Trigger CLI installation flow */
    BannerActionType["InstallCli"] = "install-cli";
})(BannerActionType || (BannerActionType = {}));
/**
 * The list of predefined banner config rendered by the Welcome Section UI.
 * TODO: Backend would return a similar JSON structure in the future which we will replace this with.
 */
export const BANNER_DATA = [
    // Sonnet 4.6 banner
    {
        // Bump this version string when copy/CTA changes and you want the banner to reappear.
        id: "claude-sonnet-4-6-2026-feb-18",
        icon: "sparkles",
        title: "Try Claude Sonnet 4.6",
        description: "Anthropic's latest model with strong reasoning and coding performance.",
        actions: [
            {
                title: "Use Sonnet 4.6",
                action: BannerActionType.SetModel,
                arg: "anthropic/claude-sonnet-4.6",
                tab: "recommended",
            },
        ],
    },
    // Minimax free promo banner
    {
        // Bump this version string when copy/CTA changes and you want the banner to reappear.
        id: "minimax-m2.5-free-2026-feb-18",
        icon: "zap",
        title: "Try MiniMax M2.5 Free",
        description: "SOTA coding capability with lightning fast inference, free in Cline.",
        actions: [
            {
                title: "Try now",
                action: BannerActionType.SetModel,
                arg: "minimax/minimax-m2.5",
                tab: "free",
            },
        ],
    },
    // ChatGPT integration banner
    {
        id: "chatgpt-integration-v1",
        icon: "megaphone",
        title: "Use ChatGPT with Cline",
        description: "Bring your ChatGPT subscription to Cline! Use your existing plan directly with no per token costs or API keys to manage.",
        actions: [
            {
                title: "Connect",
                action: BannerActionType.ShowApiSettings,
                arg: "openai-codex", // Pre-select OpenAI Codex provider
            },
        ],
    },
    // Jupyter Notebooks banner
    {
        id: "jupyter-notebooks-v1",
        icon: "book-open",
        title: "Jupyter Notebooks",
        description: "Comprehensive AI-assisted editing of `.ipynb` files with full cell-level context awareness. [Learn More →](https://docs.cline.bot/features/jupyter-notebooks)",
    },
    // Platform-specific banner (Windows)
    {
        id: "cli-info-windows-v1",
        icon: "terminal",
        title: "Cline CLI Info",
        platforms: ["windows"],
        description: "Available for macOS and Linux. Coming soon to other platforms. [Learn more](https://docs.cline.bot/cline-cli/overview)",
    },
    // Info banner with inline link
    {
        id: "info-banner-v1",
        icon: "lightbulb",
        title: "Use Cline in Right Sidebar",
        description: "For the best experience, drag the Cline icon to your right sidebar. This keeps your file explorer and editor visible while you chat with Cline, making it easier to navigate your codebase and see changes in real-time. [See how →](https://docs.cline.bot/features/customization/opening-cline-in-sidebar)",
    },
];
//# sourceMappingURL=banner.js.map