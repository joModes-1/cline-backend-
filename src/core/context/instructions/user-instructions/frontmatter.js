import * as yaml from "js-yaml";
/**
 * Parse YAML frontmatter from markdown content.
 *
 * Behavior is intentionally fail-open:
 * - If YAML fails to parse, returns data={} and body=original markdown.
 * - If no frontmatter exists, returns data={} and body=original markdown.
 */
export function parseYamlFrontmatter(markdown) {
    const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
    const match = markdown.match(frontmatterRegex);
    if (!match) {
        return { data: {}, body: markdown, hadFrontmatter: false };
    }
    const [, yamlContent, body] = match;
    try {
        const data = yaml.load(yamlContent, { schema: yaml.JSON_SCHEMA }) || {};
        return { data, body, hadFrontmatter: true };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { data: {}, body: markdown, hadFrontmatter: true, parseError: message };
    }
}
//# sourceMappingURL=frontmatter.js.map