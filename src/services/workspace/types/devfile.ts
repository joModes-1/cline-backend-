/**
 * Devfile Type Definitions
 * 
 * Adapted from Eclipse Che's devfileApi
 * Defines the structure for development environment specifications
 */

/**
 * Devfile metadata containing identifying information
 */
export interface DevfileMetadata {
  name: string;
  version?: string;
  language?: string;
  description?: string;
  tags?: string[];
}

/**
 * Environment variable definition for containers
 */
export interface DevfileEnv {
  name: string;
  value: string;
}

/**
 * Volume mount for containers
 */
export interface DevfileVolume {
  name: string;
  path: string;
}

/**
 * Container component specification
 */
export interface DevfileContainer {
  image: string;
  memoryLimit?: string;
  memoryRequest?: string;
  cpuLimit?: string;
  cpuRequest?: string;
  mountSources?: boolean;
  sourceMapping?: string;
  env?: DevfileEnv[];
  volumes?: DevfileVolume[];
  endpoints?: DevfileEndpoint[];
}

/**
 * Endpoint exposed by a component
 */
export interface DevfileEndpoint {
  name: string;
  targetPort: number;
  exposure?: 'public' | 'internal' | 'none';
  protocol?: 'http' | 'https' | 'ws' | 'wss' | 'tcp';
  path?: string;
}

/**
 * Component types in a devfile
 */
export type DevfileComponentType = 'container' | 'volume' | 'kubernetes' | 'openshift';

/**
 * Component definition
 */
export interface DevfileComponent {
  name: string;
  type: DevfileComponentType;
  container?: DevfileContainer;
  volume?: {
    size?: string;
  };
}

/**
 * Command execution target
 */
export interface DevfileExec {
  component: string;
  commandLine: string;
  workingDir?: string;
  env?: DevfileEnv[];
  hotReloadCapable?: boolean;
}

/**
 * Command definition
 */
export interface DevfileCommand {
  id: string;
  exec?: DevfileExec;
  apply?: {
    component: string;
  };
  composite?: {
    commands: string[];
    parallel?: boolean;
  };
}

/**
 * Project source configuration
 */
export interface DevfileProject {
  name: string;
  git?: {
    remotes: Record<string, string>;
    checkoutFrom?: {
      revision: string;
    };
  };
  zip?: {
    location: string;
  };
  clonePath?: string;
}

/**
 * Main devfile interface
 * Defines a complete development environment
 */
export interface Devfile {
  schemaVersion: string;
  metadata: DevfileMetadata;
  components?: DevfileComponent[];
  commands?: DevfileCommand[];
  projects?: DevfileProject[];
  events?: {
    preStart?: string[];
    postStart?: string[];
    preStop?: string[];
    postStop?: string[];
  };
}

/**
 * Devfile with optional fields for partial definitions
 */
export type DevfileLike = Partial<Devfile> & {
  metadata: Partial<DevfileMetadata> & Pick<DevfileMetadata, 'name'>;
};

/**
 * Supported programming languages
 */
export type SupportedLanguage = 
  | 'javascript' 
  | 'typescript' 
  | 'python' 
  | 'java' 
  | 'go' 
  | 'rust' 
  | 'cpp' 
  | 'csharp' 
  | 'ruby' 
  | 'php';

/**
 * Default devfile names to look for in repositories
 */
export const DEFAULT_DEVFILE_NAMES = [
  'devfile.yaml',
  'devfile.yml',
  '.devfile.yaml',
  '.devfile.yml',
];

/**
 * Check if a devfile has a container component
 */
export function hasContainerComponent(devfile: Devfile): boolean {
  return devfile.components?.some(c => c.type === 'container') ?? false;
}

/**
 * Get the main container component from a devfile
 */
export function getMainContainer(devfile: Devfile): DevfileComponent | undefined {
  return devfile.components?.find(c => c.type === 'container');
}

/**
 * Get run command from devfile commands
 */
export function getRunCommand(devfile: Devfile): DevfileCommand | undefined {
  return devfile.commands?.find(
    cmd => cmd.id.toLowerCase().includes('run') && cmd.exec
  );
}

/**
 * Get build command from devfile commands
 */
export function getBuildCommand(devfile: Devfile): DevfileCommand | undefined {
  return devfile.commands?.find(
    cmd => cmd.id.toLowerCase().includes('build') && cmd.exec
  );
}
