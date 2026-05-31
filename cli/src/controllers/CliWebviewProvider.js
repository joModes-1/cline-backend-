/**
 * CLI-specific WebviewProvider implementation
 * Instead of rendering to a webview, this outputs to the terminal
 */
export class CliWebviewProvider {
    context;
    constructor(context) {
        this.context = context;
    }
    getWebviewUrl(path) {
        // CLI doesn't have webview URLs
        return `file://${path}`;
    }
    getCspSource() {
        return "'self'";
    }
    isVisible() {
        // CLI is always "visible"
        return true;
    }
    dispose() {
        // No-op for CLI
    }
}
//# sourceMappingURL=CliWebviewProvider.js.map