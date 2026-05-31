/**
 * Shared configuration types that can be safely imported by both the extension and webview.
 * This file should not contain any Node.js-specific imports or runtime code.
 */
export var Environment;
(function (Environment) {
    Environment["production"] = "production";
    Environment["staging"] = "staging";
    Environment["local"] = "local";
    Environment["selfHosted"] = "selfHosted";
})(Environment || (Environment = {}));
//# sourceMappingURL=config-types.js.map