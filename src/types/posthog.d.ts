declare module "posthog-node" {
  export class PostHog {
    constructor(apiKey: string, options?: PostHogOptions);
    capture(options: CaptureOptions): void;
    identify(options: IdentifyOptions): void;
    alias(options: AliasOptions): void;
    flush(): Promise<void>;
    optIn(): void;
    optOut(): void;
    _shutdown(timeoutMs?: number): Promise<void>;
    shutdown(): Promise<void>;
    options: PostHogOptions;
  }

  export interface PostHogOptions {
    host?: string;
    flushAt?: number;
    flushInterval?: number;
    captureMode?: "json" | "form";
    requestTimeout?: number;
    featureFlagsPollingInterval?: number;
    maxCacheSize?: number;
  }

  export interface CaptureOptions {
    distinctId: string;
    event: string;
    properties?: Record<string, any>;
    groups?: Record<string, string>;
    timestamp?: Date;
  }

  export interface IdentifyOptions {
    distinctId: string;
    properties?: Record<string, any>;
  }

  export interface AliasOptions {
    distinctId: string;
    alias: string;
  }
}
