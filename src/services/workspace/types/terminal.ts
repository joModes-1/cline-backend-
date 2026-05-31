/**
 * Terminal Type Definitions
 * 
 * Types for WebSocket-based terminal sessions
 */

/**
 * Terminal session status
 */
export type TerminalStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

/**
 * Terminal session interface
 */
export interface TerminalSession {
  id: string;
  workspaceId: string;
  userId?: string;
  status: TerminalStatus;
  createdAt: Date;
  lastActivityAt: Date;
  rows: number;
  cols: number;
  shell: string;
  cwd: string;
  environment: Record<string, string>;
}

/**
 * Terminal session creation request
 */
export interface CreateTerminalRequest {
  workspaceId: string;
  rows?: number;
  cols?: number;
  shell?: string;
  cwd?: string;
  environment?: Record<string, string>;
}

/**
 * Terminal message types for WebSocket communication
 */
export type TerminalMessageType = 
  | 'input'      // Client → Server: keystrokes
  | 'output'     // Server → Client: terminal output
  | 'resize'     // Client → Server: terminal resize
  | 'ping'       // Bidirectional: keepalive
  | 'pong'       // Bidirectional: keepalive response
  | 'error'      // Server → Client: error occurred
  | 'ready'      // Server → Client: terminal ready
  | 'close'      // Bidirectional: close connection
  | 'data'       // Server → Client: arbitrary data
  | 'exit';      // Server → Client: process exited

/**
 * Terminal WebSocket message
 */
export interface TerminalMessage {
  type: TerminalMessageType;
  data?: string;
  rows?: number;
  cols?: number;
  code?: number;
  signal?: string;
  timestamp: Date;
}

/**
 * Terminal resize dimensions
 */
export interface TerminalDimensions {
  rows: number;
  cols: number;
  width?: number;
  height?: number;
}

/**
 * Terminal configuration
 */
export interface TerminalConfig {
  shell: string;
  cwd: string;
  env: Record<string, string>;
  encoding: string;
  handleFlowControl: boolean;
  flowControlPause: string;
  flowControlResume: string;
  scrollback: number;
  tabStopWidth: number;
}

/**
 * Default terminal configuration
 */
export const DEFAULT_TERMINAL_CONFIG: TerminalConfig = {
  shell: '/bin/bash',
  cwd: '/workspace',
  env: {},
  encoding: 'utf-8',
  handleFlowControl: true,
  flowControlPause: '\\x13',  // XOFF
  flowControlResume: '\\x11', // XON
  scrollback: 1000,
  tabStopWidth: 8,
};

/**
 * Terminal buffer entry
 */
export interface TerminalBufferEntry {
  timestamp: Date;
  type: 'input' | 'output';
  data: string;
}

/**
 * Terminal buffer for history
 */
export interface TerminalBuffer {
  sessionId: string;
  entries: TerminalBufferEntry[];
  maxSize: number;
}

/**
 * Shell information
 */
export interface ShellInfo {
  path: string;
  name: string;
  version?: string;
  isDefault: boolean;
}

/**
 * Available shells
 */
export const COMMON_SHELLS: ShellInfo[] = [
  { path: '/bin/bash', name: 'bash', isDefault: true },
  { path: '/bin/sh', name: 'sh', isDefault: false },
  { path: '/bin/zsh', name: 'zsh', isDefault: false },
];

/**
 * PTY (pseudo-terminal) process info
 */
export interface PtyProcess {
  pid: number;
  shell: string;
  cols: number;
  rows: number;
  cwd: string;
}

/**
 * WebSocket close codes for terminal
 */
export enum TerminalCloseCode {
  NORMAL = 1000,
  GOING_AWAY = 1001,
  PROTOCOL_ERROR = 1002,
  UNSUPPORTED_DATA = 1003,
  NO_STATUS = 1005,
  ABNORMAL_CLOSE = 1006,
  INVALID_DATA = 1007,
  POLICY_VIOLATION = 1008,
  MESSAGE_TOO_BIG = 1009,
  MANDATORY_EXTENSION = 1010,
  INTERNAL_ERROR = 1011,
  SERVICE_RESTART = 1012,
  TRY_AGAIN_LATER = 1013,
  BAD_GATEWAY = 1014,
  TLS_HANDSHAKE = 1015,
  
  // Custom codes
  SESSION_EXPIRED = 4000,
  WORKSPACE_STOPPED = 4001,
  PERMISSION_DENIED = 4002,
  WORKSPACE_ERROR = 4003,
}

/**
 * Check if terminal is active
 */
export function isTerminalActive(status: TerminalStatus): boolean {
  return status === 'connected' || status === 'connecting';
}

/**
 * Generate terminal session ID
 */
export function generateTerminalId(): string {
  return `term-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create resize message
 */
export function createResizeMessage(rows: number, cols: number): TerminalMessage {
  return {
    type: 'resize',
    rows,
    cols,
    timestamp: new Date(),
  };
}

/**
 * Create input message
 */
export function createInputMessage(data: string): TerminalMessage {
  return {
    type: 'input',
    data,
    timestamp: new Date(),
  };
}

/**
 * Create output message
 */
export function createOutputMessage(data: string): TerminalMessage {
  return {
    type: 'output',
    data,
    timestamp: new Date(),
  };
}

/**
 * Default terminal dimensions
 */
export const DEFAULT_TERMINAL_DIMENSIONS: TerminalDimensions = {
  rows: 24,
  cols: 80,
  width: 800,
  height: 450,
};
