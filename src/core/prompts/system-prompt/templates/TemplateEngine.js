export class TemplateEngine {
    /**
     * Resolves template placeholders in the format {{PLACEHOLDER}} with provided values
     */
    resolve(template, context, placeholders) {
        if (typeof template === "function") {
            template = template(context);
        }
        return template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
            const trimmedKey = key.trim();
            // Support nested object access using dot notation
            const value = this.getNestedValue(placeholders, trimmedKey);
            if (value !== undefined && value !== null) {
                return typeof value === "string" ? value : JSON.stringify(value);
            }
            // Keep placeholder if not found (allows for partial resolution)
            return match;
        });
    }
    /**
     * Validates that a template has all required placeholders filled
     */
    validate(template, requiredPlaceholders) {
        const missingPlaceholders = [];
        for (const placeholder of requiredPlaceholders) {
            const regex = new RegExp(`\\{\\{\\s*${placeholder}\\s*\\}\\}`, "g");
            if (!regex.test(template)) {
                missingPlaceholders.push(placeholder);
            }
        }
        return missingPlaceholders;
    }
    /**
     * Extracts all placeholder names from a template
     */
    extractPlaceholders(template) {
        const placeholders = [];
        const regex = /\{\{([^}]+)\}\}/g;
        let match = null;
        match = regex.exec(template);
        while (match !== null) {
            const placeholder = match[1].trim();
            if (!placeholders.includes(placeholder)) {
                placeholders.push(placeholder);
            }
            match = regex.exec(template);
        }
        return placeholders;
    }
    /**
     * Gets nested value from object using dot notation (e.g., "user.name" -> obj.user.name)
     */
    getNestedValue(obj, path) {
        return path.split(".").reduce((current, key) => {
            return current && typeof current === "object" && current !== null
                ? current[key]
                : undefined;
        }, obj);
    }
    /**
     * Escapes template placeholders to prevent accidental resolution
     */
    escape(template) {
        return template.replace(/\{\{/g, "\\{\\{").replace(/\}\}/g, "\\}\\}");
    }
    /**
     * Unescapes template placeholders
     */
    unescape(template) {
        return template.replace(/\\{\\{/g, "{{").replace(/\\}\\}/g, "}}");
    }
}
//# sourceMappingURL=TemplateEngine.js.map