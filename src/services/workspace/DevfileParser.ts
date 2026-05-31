/**
 * Devfile Parser
 * 
 * Parses and validates devfile configurations
 * Creates workspace configurations from devfile specs
 */

import * as yaml from 'js-yaml';
import * as path from 'path';
import { Logger } from '../../shared/services/Logger';
import type { 
  Devfile, 
  DevfileLike, 
  DevfileComponent,
  SupportedLanguage,
} from './types';
import { DEFAULT_DEVFILE_NAMES } from './types';
import type { LanguageConfig } from './types';

/**
 * Parse result
 */
export interface ParseResult {
  valid: boolean;
  devfile?: Devfile;
  errors: string[];
  warnings: string[];
}

/**
 * Validation error
 */
export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

/**
 * Devfile parser
 */
export class DevfileParser {
  private supportedVersions = ['2.0.0', '2.1.0', '2.2.0'];

  /**
   * Parse devfile from YAML string
   */
  parse(yamlContent: string): ParseResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const parsed = yaml.load(yamlContent) as DevfileLike;
      
      if (!parsed) {
        return { valid: false, errors: ['Empty devfile content'], warnings };
      }

      // Validate schema version
      if (!parsed.schemaVersion) {
        errors.push('Missing schemaVersion');
      } else if (!this.supportedVersions.includes(parsed.schemaVersion)) {
        warnings.push(`Schema version ${parsed.schemaVersion} may not be fully supported`);
      }

      // Validate metadata
      if (!parsed.metadata?.name) {
        errors.push('Missing metadata.name');
      }

      // Validate components
      if (parsed.components) {
        for (let i = 0; i < parsed.components.length; i++) {
          const comp = parsed.components[i];
          if (!comp.name) {
            errors.push(`Component[${i}] missing name`);
          }
          if (!comp.type) {
            errors.push(`Component[${i}] missing type`);
          }
        }
      }

      if (errors.length > 0) {
        return { valid: false, errors, warnings };
      }

      // Normalize to full Devfile
      const devfile: Devfile = {
        schemaVersion: parsed.schemaVersion || '2.2.0',
        metadata: {
          name: parsed.metadata!.name,
          version: parsed.metadata?.version || '1.0.0',
          language: parsed.metadata?.language,
          description: parsed.metadata?.description,
          tags: parsed.metadata?.tags || [],
        },
        components: parsed.components || [],
        commands: parsed.commands || [],
        projects: parsed.projects || [],
        events: parsed.events,
      };

      return { valid: true, devfile, errors, warnings };

    } catch (error) {
      Logger.error('[DevfileParser] Failed to parse devfile:', error);
      return { 
        valid: false, 
        errors: [`Parse error: ${error instanceof Error ? error.message : 'Unknown error'}`], 
        warnings 
      };
    }
  }

  /**
   * Load devfile from file path
   */
  async loadFromFile(filePath: string): Promise<ParseResult> {
    try {
      const fs = await import('fs/promises');
      const content = await fs.readFile(filePath, 'utf-8');
      return this.parse(content);
    } catch (error) {
      Logger.error(`[DevfileParser] Failed to load devfile from ${filePath}:`, error);
      return {
        valid: false,
        errors: [`Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`],
        warnings: [],
      };
    }
  }

  /**
   * Find devfile in directory
   */
  async findDevfile(dirPath: string): Promise<{ path: string; content: ParseResult } | null> {
    const fs = await import('fs/promises');
    
    for (const name of DEFAULT_DEVFILE_NAMES) {
      const filePath = path.join(dirPath, name);
      try {
        await fs.access(filePath);
        const result = await this.loadFromFile(filePath);
        return { path: filePath, content: result };
      } catch {
        // File doesn't exist, continue
      }
    }
    
    return null;
  }

  /**
   * Generate devfile from language
   */
  generateFromLanguage(
    language: SupportedLanguage, 
    name?: string,
    repoUrl?: string
  ): Devfile {
    const configs = this.getLanguageConfigs();
    const config = configs.find(c => c.id === language);
    
    if (!config) {
      throw new Error(`Unsupported language: ${language}`);
    }

    const devfile: Devfile = {
      schemaVersion: '2.2.0',
      metadata: {
        name: name || `${language}-workspace`,
        language,
        version: '1.0.0',
      },
      components: [
        {
          name: 'dev',
          type: 'container',
          container: {
            image: config.dockerImage,
            memoryLimit: config.memoryLimit || '512Mi',
            mountSources: true,
            env: Object.entries(config.envVars || {}).map(([name, value]) => ({ name, value })),
          },
        },
      ],
      commands: [
        {
          id: 'run',
          exec: {
            component: 'dev',
            commandLine: config.commands.run,
            workingDir: '${PROJECTS_ROOT}',
          },
        },
      ],
    };

    if (config.commands.build) {
      if (!devfile.commands) {
        devfile.commands = [];
      }
      devfile.commands.push({
        id: 'build',
        exec: {
          component: 'dev',
          commandLine: config.commands.build,
          workingDir: '${PROJECTS_ROOT}',
        },
      });
    }

    if (repoUrl) {
      devfile.projects = [
        {
          name: 'project',
          git: {
            remotes: { origin: repoUrl },
          },
        },
      ];
    }

    return devfile;
  }

  /**
   * Detect language from devfile
   */
  detectLanguage(devfile: Devfile): SupportedLanguage | undefined {
    // Check explicit metadata
    if (devfile.metadata.language) {
      return devfile.metadata.language as SupportedLanguage;
    }

    // Check tags
    for (const tag of devfile.metadata.tags || []) {
      const lang = this.tagToLanguage(tag);
      if (lang) return lang;
    }

    // Check container images
    for (const component of devfile.components || []) {
      if (component.container?.image) {
        const lang = this.imageToLanguage(component.container.image);
        if (lang) return lang;
      }
    }

    return undefined;
  }

  /**
   * Get run command from devfile
   */
  getRunCommand(devfile: Devfile): string | undefined {
    const cmd = devfile.commands?.find(c => 
      c.id.toLowerCase().includes('run') || 
      c.id.toLowerCase().includes('start')
    );
    return cmd?.exec?.commandLine;
  }

  /**
   * Get build command from devfile
   */
  getBuildCommand(devfile: Devfile): string | undefined {
    const cmd = devfile.commands?.find(c => 
      c.id.toLowerCase().includes('build') || 
      c.id.toLowerCase().includes('compile')
    );
    return cmd?.exec?.commandLine;
  }

  /**
   * Get the main container component from a devfile
   */
  getMainContainer(devfile: Devfile): DevfileComponent | undefined {
    return devfile.components?.find(c => c.type === 'container');
  }

  /**
   * Convert devfile to LanguageConfig
   */
  toLanguageConfig(devfile: Devfile): LanguageConfig | null {
    const language = this.detectLanguage(devfile);
    if (!language) return null;

    const container = this.getMainContainer(devfile);
    if (!container?.container) return null;

    const configs = this.getLanguageConfigs();
    const baseConfig = configs.find(c => c.id === language);
    if (!baseConfig) return null;

    return {
      ...baseConfig,
      dockerImage: container.container.image,
      commands: {
        run: this.getRunCommand(devfile) || baseConfig.commands.run,
        build: this.getBuildCommand(devfile) || baseConfig.commands.build,
        install: baseConfig.commands.install,
        test: baseConfig.commands.test,
      },
      memoryLimit: container.container.memoryLimit,
    };
  }

  /**
   * Get default language configurations
   */
  getLanguageConfigs(): LanguageConfig[] {
    return [
      {
        id: 'javascript',
        name: 'javascript',
        displayName: 'JavaScript',
        fileExtensions: ['.js', '.jsx'],
        dockerImage: 'node:18-alpine',
        defaultCommand: 'node ${file}',
        commands: {
          run: 'node ${file}',
          install: 'npm install',
          test: 'npm test',
        },
        envVars: { NODE_ENV: 'development' },
        defaultTimeout: 30,
        memoryLimit: '512Mi',
      },
      {
        id: 'typescript',
        name: 'typescript',
        displayName: 'TypeScript',
        fileExtensions: ['.ts', '.tsx'],
        dockerImage: 'node:18-alpine',
        defaultCommand: 'npx ts-node ${file}',
        commands: {
          run: 'npx ts-node ${file}',
          build: 'npx tsc',
          install: 'npm install',
          test: 'npm test',
        },
        envVars: { NODE_ENV: 'development' },
        defaultTimeout: 30,
        memoryLimit: '512Mi',
      },
      {
        id: 'python',
        name: 'python',
        displayName: 'Python',
        fileExtensions: ['.py'],
        dockerImage: 'python:3.11-slim',
        defaultCommand: 'python ${file}',
        commands: {
          run: 'python ${file}',
          install: 'pip install -r requirements.txt',
          test: 'pytest',
        },
        defaultTimeout: 30,
        memoryLimit: '512Mi',
      },
      {
        id: 'java',
        name: 'java',
        displayName: 'Java',
        fileExtensions: ['.java'],
        dockerImage: 'openjdk:17-slim',
        defaultCommand: 'java ${file}',
        commands: {
          run: 'java ${file}',
          build: 'javac ${file}',
          install: 'mvn install',
          test: 'mvn test',
        },
        defaultTimeout: 60,
        memoryLimit: '1Gi',
      },
      {
        id: 'go',
        name: 'go',
        displayName: 'Go',
        fileExtensions: ['.go'],
        dockerImage: 'golang:1.21-alpine',
        defaultCommand: 'go run ${file}',
        commands: {
          run: 'go run ${file}',
          build: 'go build',
          install: 'go mod download',
          test: 'go test',
        },
        envVars: { CGO_ENABLED: '0' },
        defaultTimeout: 30,
        memoryLimit: '512Mi',
      },
      {
        id: 'rust',
        name: 'rust',
        displayName: 'Rust',
        fileExtensions: ['.rs'],
        dockerImage: 'rust:1.75-slim',
        defaultCommand: 'rustc ${file} && ./main',
        commands: {
          run: 'rustc ${file} && ./main',
          build: 'cargo build',
          install: 'cargo fetch',
          test: 'cargo test',
        },
        defaultTimeout: 60,
        memoryLimit: '1Gi',
      },
    ];
  }

  /**
   * Convert tag to language
   */
  private tagToLanguage(tag: string): SupportedLanguage | undefined {
    const tagMap: Record<string, SupportedLanguage> = {
      nodejs: 'javascript',
      javascript: 'javascript',
      typescript: 'typescript',
      python: 'python',
      java: 'java',
      golang: 'go',
      go: 'go',
      rust: 'rust',
    };
    return tagMap[tag.toLowerCase()];
  }

  /**
   * Convert container image to language
   */
  private imageToLanguage(image: string): SupportedLanguage | undefined {
    const imageMap: Record<string, SupportedLanguage> = {
      'node': 'javascript',
      'python': 'python',
      'openjdk': 'java',
      'golang': 'go',
      'rust': 'rust',
    };

    const imageLower = image.toLowerCase();
    for (const [prefix, lang] of Object.entries(imageMap)) {
      if (imageLower.includes(prefix)) {
        return lang;
      }
    }
    return undefined;
  }

  /**
   * Serialize devfile to YAML
   */
  serialize(devfile: Devfile): string {
    return yaml.dump(devfile, {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
    });
  }
}
