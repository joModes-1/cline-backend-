/**
 * CLI-specific WebviewProvider implementation
 * Instead of rendering to a webview, this outputs to the terminal
 */

import type * as vscode from "vscode"

export class CliWebviewProvider {
	private context: vscode.ExtensionContext

	constructor(context: vscode.ExtensionContext) {
		this.context = context
	}

	getWebviewUrl(path: string): string {
		// CLI doesn't have webview URLs
		return `file://${path}`
	}

	getCspSource(): string {
		return "'self'"
	}

	isVisible(): boolean {
		// CLI is always "visible"
		return true
	}

	dispose(): void {
		// No-op for CLI
	}
}
