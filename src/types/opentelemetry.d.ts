declare module "@opentelemetry/api" {
  export interface Meter {
    createCounter(name: string, options?: any): Counter;
    createUpDownCounter(name: string, options?: any): UpDownCounter;
    createHistogram(name: string, options?: any): Histogram;
    createObservableGauge(name: string, options?: any): ObservableGauge;
  }

  export interface Counter {
    add(value: number, attributes?: Record<string, any>): void;
  }

  export interface UpDownCounter {
    add(value: number, attributes?: Record<string, any>): void;
  }

  export interface Histogram {
    record(value: number, attributes?: Record<string, any>): void;
  }

  export interface ObservableGauge {
    addCallback(callback: (observableResult: ObservableResult) => void): void;
  }

  export interface ObservableResult {
    observe(value: number, attributes?: Record<string, any>): void;
  }

  export function metrics(): MetricsAPI;

  export interface MetricsAPI {
    getMeter(name: string, version?: string): Meter;
  }

  export const context: any;
  export const trace: any;
  export const diag: any;
}

declare module "@opentelemetry/api-logs" {
  export interface Logger {
    emit(logRecord: LogRecord): void;
  }

  export interface LogRecord {
    body?: string;
    severityNumber?: number;
    severityText?: string;
    attributes?: Record<string, any>;
    timestamp?: number;
  }

  export function logs(): LogsAPI;

  export interface LogsAPI {
    getLogger(name: string, version?: string): Logger;
  }
}

declare module "@opentelemetry/resources" {
  export class Resource {
    constructor(attributes: Record<string, any>);
    static default(): Resource;
    static empty(): Resource;
    merge(other: Resource): Resource;
    get attributes(): Record<string, any>;
  }
}

declare module "@opentelemetry/sdk-metrics" {
  export class MeterProvider {
    constructor(options: { resource?: any; readers?: MetricReader[] });
    getMeter(name: string, version?: string): any;
    shutdown(): Promise<void>;
  }

  export interface MetricReader {
    collect(): Promise<any>;
    shutdown(): Promise<void>;
    forceFlush(): Promise<void>;
  }

  export class PeriodicExportingMetricReader implements MetricReader {
    constructor(options: { exporter: any; exportIntervalMillis?: number; exportTimeoutMillis?: number });
    collect(): Promise<any>;
    shutdown(): Promise<void>;
    forceFlush(): Promise<void>;
  }

  export class ConsoleMetricExporter {
    export(metrics: any, resultCallback: (result: any) => void): void;
    shutdown(): Promise<void>;
  }

  export { MetricReader };
}

declare module "@opentelemetry/exporter-metrics-otlp-http" {
  export class OTLPMetricExporter {
    constructor(options?: { url?: string; headers?: Record<string, string> });
    export(metrics: any, resultCallback: (result: any) => void): void;
    shutdown(): Promise<void>;
  }
}

declare module "@grpc/reflection" {
  export class ReflectionService {
    constructor(serviceNames: string[]);
    addToServer(server: any): void;
  }
}

declare module "ws" {
  export class WebSocketServer {
    constructor(options: { port?: number; server?: any });
    on(event: string, callback: (...args: any[]) => void): void;
    close(callback?: () => void): void;
    clients: Set<WebSocket>;
  }

  export class WebSocket {
    constructor(url: string | string[], protocols?: string | string[]);
    static readonly CONNECTING: number;
    static readonly OPEN: number;
    static readonly CLOSING: number;
    static readonly CLOSED: number;
    readyState: number;
    onopen: ((event: any) => void) | null;
    onclose: ((event: any) => void) | null;
    onmessage: ((event: any) => void) | null;
    onerror: ((event: any) => void) | null;
    send(data: string | Buffer | ArrayBuffer | Buffer[]): void;
    close(code?: number, reason?: string): void;
    ping(): void;
    pong(): void;
    terminate(): void;
    on(event: string, callback: (...args: any[]) => void): void;
  }

  export default WebSocket;
}

declare module "@streamparser/json" {
  export class JSONParser {
    constructor(options?: { paths?: string[]; keepStack?: boolean });
    onValue(callback: (value: any) => void): void;
    write(buffer: Buffer | string): void;
  }
}

declare module "express-fileupload" {
  import { Request, Response, NextFunction } from "express";

  interface FileUploadOptions {
    createParentPath?: boolean;
    uriDecodeFileNames?: boolean;
    safeFileNames?: boolean;
    preserveExtension?: boolean | number;
    abortOnLimit?: boolean;
    responseOnLimit?: string;
    limitHandler?: (req: Request, res: Response, next: NextFunction) => void;
    useTempFiles?: boolean;
    tempFileDir?: string;
    debug?: boolean;
    uploadTimeout?: number;
    limits?: { fileSize?: number; files?: number };
  }

  interface UploadedFile {
    name: string;
    mv(path: string, callback: (err: any) => void): void;
    mv(path: string): Promise<void>;
    mimetype: string;
    encoding: string;
    tempFilePath: string;
    truncated: boolean;
    size: number;
    data: Buffer;
  }

  function fileUpload(options?: FileUploadOptions): (req: Request, res: Response, next: NextFunction) => void;

  export = fileUpload;
}
