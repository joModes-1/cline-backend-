/**
 * A Copy of the Type Definition for Visual Studio Code 1.84 Extension API
 * See https://code.visualstudio.com/api for more information
 */
var ExtensionMode;
(function (ExtensionMode) {
    /**
     * The extension is installed normally (for example, from the marketplace
     * or VSIX) in the editor.
     */
    ExtensionMode[ExtensionMode["Production"] = 1] = "Production";
    /**
     * The extension is running from an `--extensionDevelopmentPath` provided
     * when launching the editor.
     */
    ExtensionMode[ExtensionMode["Development"] = 2] = "Development";
    /**
     * The extension is running from an `--extensionTestsPath` and
     * the extension host is running unit tests.
     */
    ExtensionMode[ExtensionMode["Test"] = 3] = "Test";
})(ExtensionMode || (ExtensionMode = {}));
export var ExtensionKind;
(function (ExtensionKind) {
    /**
     * Extension runs where the UI runs.
     */
    ExtensionKind[ExtensionKind["UI"] = 1] = "UI";
    /**
     * Extension runs where the remote extension host runs.
     */
    ExtensionKind[ExtensionKind["Workspace"] = 2] = "Workspace";
})(ExtensionKind || (ExtensionKind = {}));
//# sourceMappingURL=context.js.map