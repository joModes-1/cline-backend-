declare module "@modelcontextprotocol/sdk/client/auth.js" {
  export class OAuthClientProvider {
    constructor(clientInfo: OAuthClientInformationFull);
    getClient(): Promise<OAuthClientInformationFull>;
    getTokens(): Promise<OAuthTokens>;
    saveTokens(tokens: OAuthTokens): Promise<void>;
    redirectToAuthorization(authUrl: URL): Promise<void>;
    saveCodeVerifier(verifier: string): Promise<void>;
    getCodeVerifier(): Promise<string>;
  }

  export interface OAuthClientInformationFull {
    client_id: string;
    client_secret?: string;
    redirect_uris: string[];
  }

  export interface OAuthTokens {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  }

  export class UnauthorizedError extends Error {
    constructor(message: string);
  }
}

declare module "@modelcontextprotocol/sdk/client/index.js" {
  export class Client {
    constructor(info: { name: string; version: string });
    connect(transport: any): Promise<void>;
    close(): Promise<void>;
    listTools(): Promise<{ tools: any[] }>;
    callTool(params: { name: string; arguments: any }): Promise<any>;
    listPrompts(): Promise<{ prompts: any[] }>;
    getPrompt(params: { name: string; arguments?: any }): Promise<any>;
    listResources(): Promise<{ resources: any[] }>;
    readResource(params: { uri: string }): Promise<any>;
    setLoggingLevel(level: string): Promise<void>;
    onnotification?: (notification: any) => void;
  }
}

declare module "@modelcontextprotocol/sdk/client/sse.js" {
  export class SSEClientTransport {
    constructor(url: URL, opts?: { authProvider?: any });
    onclose?: () => void;
    onerror?: (error: Error) => void;
    start(): Promise<void>;
    close(): Promise<void>;
    send(message: any): Promise<void>;
  }
}

declare module "@modelcontextprotocol/sdk/client/stdio.js" {
  export class StdioClientTransport {
    constructor(command: string, args?: string[], env?: Record<string, string>);
    onclose?: () => void;
    onerror?: (error: Error) => void;
    start(): Promise<void>;
    close(): Promise<void>;
    send(message: any): Promise<void>;
  }

  export function getDefaultEnvironment(): Record<string, string>;
}

declare module "@modelcontextprotocol/sdk/client/streamableHttp.js" {
  export class StreamableHTTPClientTransport {
    constructor(url: URL, opts?: { authProvider?: any });
    onclose?: () => void;
    onerror?: (error: Error) => void;
    start(): Promise<void>;
    close(): Promise<void>;
    send(message: any): Promise<void>;
  }
}

declare module "@modelcontextprotocol/sdk/shared/auth.js" {
  export interface OAuthClientInformationFull {
    client_id: string;
    client_secret?: string;
    redirect_uris: string[];
  }

  export interface OAuthClientMetadata {
    client_name: string;
    client_uri?: string;
  }

  export interface OAuthTokens {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  }
}

declare module "@modelcontextprotocol/sdk/types.js" {
  export const LATEST_PROTOCOL_VERSION: string;
  export const SUPPORTED_PROTOCOL_VERSIONS: string[];

  export interface Tool {
    name: string;
    description?: string;
    inputSchema: any;
  }

  export interface TextContent {
    type: "text";
    text: string;
  }
}
