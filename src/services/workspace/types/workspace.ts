/**
 * Workspace Type Definitions
 * 
 * Defines workspace interfaces adapted from Eclipse Che's DevWorkspace
 */

import type { Devfile } from './devfile';

/**
 * Workspace status phases
 */
export type WorkspaceStatus = 
  | 'starting' 
  | 'running' 
  | 'stopped' 
  | 'error' 
  | 'terminating' 
  | 'deleting';

/**
 * Workspace metadata
 */
export interface WorkspaceMetadata {
  id: string;
  name: string;
  namespace?: string;
  creationTimestamp?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
}

/**
 * Workspace routing information
 * Exposed endpoints and URLs
 */
export interface WorkspaceRouting {
  endpoints?: Record<string, {
    url: string;
    attributes?: Record<string, string>;
  }>;
  mainUrl?: string;
  terminalUrl?: string;
}

/**
 * Workspace conditions for tracking state changes
 */
export interface WorkspaceCondition {
  type: string;
  status: 'True' | 'False' | 'Unknown';
  lastTransitionTime?: string;
  reason?: string;
  message?: string;
}

/**
 * Workspace status details
 */
export interface WorkspaceStatusInfo {
  phase: WorkspaceStatus;
  message?: string;
  mainUrl?: string;
  conditions?: WorkspaceCondition[];
  workspaceId?: string;
  repoId?: string;
  devfile?: string;
}

/**
 * Main workspace interface
 * Represents a runtime development environment
 */
export interface Workspace {
  apiVersion: string;
  kind: 'Workspace';
  metadata: WorkspaceMetadata;
  spec: {
    started: boolean;
    routingClass?: string;
    template?: {
      components?: any[];
      commands?: any[];
      projects?: any[];
    };
  };
  status?: WorkspaceStatusInfo;
}

/**
 * Workspace with devfile source
 */
export interface WorkspaceWithDevfile extends Workspace {
  devfile: Devfile;
  localPath?: string;
  repoId?: string;
}

/**
 * Workspace creation request
 */
export interface CreateWorkspaceRequest {
  name?: string;
  devfile: Devfile;
  repoId?: string;
  autoStart?: boolean;
  sourceCode?: {
    repoUrl?: string;
    branch?: string;
    localPath?: string;
  };
}

/**
 * Workspace update request
 */
export interface UpdateWorkspaceRequest {
  devfile?: Devfile;
  started?: boolean;
}

/**
 * Workspace list response
 */
export interface WorkspaceList {
  workspaces: Workspace[];
  total: number;
}

/**
 * Workspace runtime information
 */
export interface WorkspaceRuntime {
  id: string;
  status: WorkspaceStatus;
  startTime?: Date;
  endTime?: Date;
  containerId?: string;
  processId?: number;
  ports: number[];
  endpoints: {
    name: string;
    url: string;
    port: number;
  }[];
  memoryUsage?: number;
  cpuUsage?: number;
}

/**
 * Workspace configuration
 */
export interface WorkspaceConfig {
  timeout?: number;  // seconds
  memoryLimit?: string;  // e.g., "512Mi", "1Gi"
  cpuLimit?: string;  // e.g., "500m", "1"
  networkAccess?: boolean;
  privileged?: boolean;
}

/**
 * Check if workspace is active (running or starting)
 */
export function isWorkspaceActive(status: WorkspaceStatus): boolean {
  return status === 'running' || status === 'starting';
}

/**
 * Check if workspace can be started
 */
export function canStartWorkspace(status: WorkspaceStatus): boolean {
  return status === 'stopped' || status === 'error';
}

/**
 * Check if workspace can be stopped
 */
export function canStopWorkspace(status: WorkspaceStatus): boolean {
  return status === 'running' || status === 'starting';
}

/**
 * Check if workspace is in a terminal state
 */
export function isWorkspaceTerminal(status: WorkspaceStatus): boolean {
  return status === 'stopped' || status === 'error' || status === 'deleting';
}

/**
 * Get display name for workspace status
 */
export function getWorkspaceStatusDisplay(status: WorkspaceStatus): string {
  const displays: Record<WorkspaceStatus, string> = {
    starting: 'Starting',
    running: 'Running',
    stopped: 'Stopped',
    error: 'Error',
    terminating: 'Stopping',
    deleting: 'Deleting',
  };
  return displays[status] || status;
}

/**
 * Generate workspace ID from name
 */
export function generateWorkspaceId(name: string): string {
  const timestamp = Date.now().toString(36);
  const sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .substring(0, 20);
  return `${sanitized}-${timestamp}`;
}
