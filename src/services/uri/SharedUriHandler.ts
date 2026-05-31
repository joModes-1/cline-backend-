// Stub for SharedUriHandler in web/standalone builds

export class SharedUriHandler {
	static async handleUri(_uri: string): Promise<boolean> {
		return false
	}
}
