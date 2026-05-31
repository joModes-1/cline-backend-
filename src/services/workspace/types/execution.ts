/**
 * Code Execution Type Definitions
 * 
 * Types for running code in sandboxed workspaces
 */

import type { SupportedLanguage } from './devfile';

/**
 * Code execution request
 */
export interface ExecutionRequest {
  code: string;
  language: SupportedLanguage;
  fileName?: string;
  workspaceId?: string;
  input?: string;
  timeout?: number;
  environment?: Record<string, string>;
}

/**
 * Execution result status
 */
export type ExecutionStatus = 'pending' | 'running' | 'success' | 'error' | 'timeout' | 'cancelled';

/**
 * Code execution result
 */
export interface ExecutionResult {
  executionId: string;
  status: ExecutionStatus;
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
  memoryUsage?: number;
  startTime: Date;
  endTime?: Date;
}

/**
 * Execution with metadata
 */
export interface Execution extends ExecutionResult {
  request: ExecutionRequest;
  workspaceId: string;
  userId?: string;
}

/**
 * Execution list response
 */
export interface ExecutionList {
  executions: Execution[];
  total: number;
  page?: number;
  pageSize?: number;
}

/**
 * Execution stream event types
 */
export type ExecutionStreamEventType = 
  | 'start' 
  | 'output' 
  | 'error' 
  | 'complete' 
  | 'timeout';

/**
 * Execution stream event
 */
export interface ExecutionStreamEvent {
  type: ExecutionStreamEventType;
  executionId: string;
  timestamp: Date;
  data?: string;
  exitCode?: number;
  duration?: number;
}

/**
 * Language detection result
 */
export interface LanguageDetection {
  language: SupportedLanguage;
  confidence: number;
  fileExtension?: string;
  detectedFrom: 'extension' | 'content' | 'manual';
}

/**
 * Command to run for a language
 */
export interface LanguageCommand {
  command: string;
  args: string[];
  fileExtension: string;
  installCommand?: string;
  buildCommand?: string;
}

/**
 * Language configuration
 */
export interface LanguageConfig {
  id: SupportedLanguage;
  name: string;
  displayName: string;
  fileExtensions: string[];
  dockerImage: string;
  defaultCommand: string;
  commands: {
    run: string;
    build?: string;
    install?: string;
    test?: string;
  };
  envVars?: Record<string, string>;
  defaultTimeout?: number;
  memoryLimit?: string;
}

/**
 * Build configuration for compiled languages
 */
export interface BuildConfig {
  enabled: boolean;
  command?: string;
  outputDir?: string;
  artifacts?: string[];
}

/**
 * Test execution configuration
 */
export interface TestConfig {
  enabled: boolean;
  command?: string;
  pattern?: string;
  timeout?: number;
}

/**
 * Code snippet metadata
 */
export interface CodeSnippet {
  id: string;
  name: string;
  language: SupportedLanguage;
  code: string;
  description?: string;
  tags?: string[];
  createdAt: Date;
  updatedAt?: Date;
}

/**
 * Execution statistics
 */
export interface ExecutionStats {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  timeoutExecutions: number;
  averageDuration: number;
  averageMemoryUsage: number;
  languageBreakdown: Record<SupportedLanguage, number>;
  lastExecutionAt?: Date;
}

/**
 * Resource limits for code execution
 */
export interface ExecutionLimits {
  maxExecutionTime: number;  // seconds
  maxMemory: number;  // MB
  maxCpu?: number;  // percentage
  maxOutputSize: number;  // bytes
  maxConcurrentExecutions: number;
}

/**
 * Default execution limits
 */
export const DEFAULT_EXECUTION_LIMITS: ExecutionLimits = {
  maxExecutionTime: 30,
  maxMemory: 256,
  maxOutputSize: 1024 * 1024,  // 1MB
  maxConcurrentExecutions: 5,
};

/**
 * Check if execution completed successfully
 */
export function isExecutionSuccessful(result: ExecutionResult): boolean {
  return result.status === 'success' && result.exitCode === 0;
}

/**
 * Check if execution is complete (terminal state)
 */
export function isExecutionComplete(status: ExecutionStatus): boolean {
  return ['success', 'error', 'timeout', 'cancelled'].includes(status);
}

/**
 * Get language from file extension
 */
export function getLanguageFromExtension(ext: string): SupportedLanguage | undefined {
  const extMap: Record<string, SupportedLanguage> = {
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.py': 'python',
    '.java': 'java',
    '.go': 'go',
    '.rs': 'rust',
    '.cpp': 'cpp',
    '.cc': 'cpp',
    '.cxx': 'cpp',
    '.c': 'cpp',
    '.cs': 'csharp',
    '.rb': 'ruby',
    '.php': 'php',
  };
  
  const lowerExt = ext.toLowerCase();
  return extMap[lowerExt];
}

/**
 * Generate execution ID
 */
export function generateExecutionId(): string {
  return `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
