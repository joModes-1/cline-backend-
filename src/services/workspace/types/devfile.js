/**
 * Devfile Type Definitions
 *
 * Adapted from Eclipse Che's devfileApi
 * Defines the structure for development environment specifications
 */
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
export function hasContainerComponent(devfile) {
    return devfile.components?.some(c => c.type === 'container') ?? false;
}
/**
 * Get the main container component from a devfile
 */
export function getMainContainer(devfile) {
    return devfile.components?.find(c => c.type === 'container');
}
/**
 * Get run command from devfile commands
 */
export function getRunCommand(devfile) {
    return devfile.commands?.find(cmd => cmd.id.toLowerCase().includes('run') && cmd.exec);
}
/**
 * Get build command from devfile commands
 */
export function getBuildCommand(devfile) {
    return devfile.commands?.find(cmd => cmd.id.toLowerCase().includes('build') && cmd.exec);
}
//# sourceMappingURL=devfile.js.map