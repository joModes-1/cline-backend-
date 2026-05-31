/**
 * Handles formatting and presentation of workspace migration reports
 *
 * Separated from WorkspaceResolver to follow Single Responsibility Principle.
 * This class focuses purely on report generation and formatting.
 */
/**
 * Handles generation and formatting of migration reports
 */
export class MigrationReporter {
    defaultOptions = {
        includeExamples: true,
        includeHighUsage: true,
        highUsageThreshold: 100,
        sortByUsage: true,
    };
    /**
     * Generate a comprehensive migration report from usage statistics
     * @param usageMap - Map of component names to their usage statistics
     * @param traceEnabled - Whether tracing is currently enabled
     * @param options - Optional configuration for report generation
     * @returns Formatted migration report string
     */
    generateReport(usageMap, traceEnabled, options = {}) {
        const config = { ...this.defaultOptions, ...options };
        const entries = this.prepareEntries(usageMap, config.sortByUsage);
        let report = this.generateHeader(entries.length, traceEnabled);
        report += this.generateComponentDetails(entries, config);
        report += this.generateSummary(entries);
        if (config.includeHighUsage) {
            report += this.generateHighUsageSection(entries, config.highUsageThreshold);
        }
        return report;
    }
    /**
     * Generate a simplified summary report
     * @param usageMap - Map of component names to their usage statistics
     * @returns Brief summary string
     */
    generateSummary(entries) {
        const totalCalls = entries.reduce((sum, [_, stats]) => sum + stats.count, 0);
        let summary = `\n=== Summary ===\n`;
        summary += `Total path resolution calls: ${totalCalls}\n`;
        return summary;
    }
    /**
     * Prepare and optionally sort the usage entries
     */
    prepareEntries(usageMap, sortByUsage) {
        const entries = Array.from(usageMap.entries());
        if (sortByUsage) {
            return entries.sort((a, b) => b[1].count - a[1].count);
        }
        return entries;
    }
    /**
     * Generate the report header section
     */
    generateHeader(componentCount, traceEnabled) {
        let header = "=== Multi-Root Migration Report ===\n";
        header += `Total components using single-root: ${componentCount}\n`;
        header += `Trace enabled: ${traceEnabled}\n\n`;
        return header;
    }
    /**
     * Generate detailed component usage information
     */
    generateComponentDetails(entries, config) {
        let details = "";
        entries.forEach(([context, stats]) => {
            details += `${context}:\n`;
            details += `  Calls: ${stats.count}\n`;
            details += `  Last used: ${stats.lastUsed.toISOString()}\n`;
            if (config.includeExamples && stats.examples.length > 0) {
                details += `  Example paths:\n`;
                stats.examples.forEach((ex) => {
                    details += `    - "${ex}"\n`;
                });
            }
            details += "\n";
        });
        return details;
    }
    /**
     * Generate high-usage components section
     */
    generateHighUsageSection(entries, threshold) {
        const highUsageComponents = entries
            .filter(([_, stats]) => stats.count > threshold)
            .map(([context, stats]) => ({ context, count: stats.count }));
        if (highUsageComponents.length === 0) {
            return "";
        }
        let section = `\n=== High-Usage Components ===\n`;
        section += `(Operations with >${threshold} calls)\n`;
        highUsageComponents.forEach((h) => {
            section += `  - ${h.context}: ${h.count} calls\n`;
        });
        return section;
    }
    /**
     * Generate a JSON representation of the usage data
     * @param usageMap - Map of component names to their usage statistics
     * @returns JSON string representation
     */
    generateJsonReport(usageMap) {
        const data = Object.fromEntries(usageMap);
        return JSON.stringify(data, null, 2);
    }
    /**
     * Generate a CSV representation of the usage data
     * @param usageMap - Map of component names to their usage statistics
     * @returns CSV string representation
     */
    generateCsvReport(usageMap) {
        const entries = Array.from(usageMap.entries());
        let csv = "Component,Calls,LastUsed,ExamplePaths\n";
        entries.forEach(([context, stats]) => {
            const examples = stats.examples.join("; ");
            csv += `"${context}",${stats.count},"${stats.lastUsed.toISOString()}","${examples}"\n`;
        });
        return csv;
    }
}
//# sourceMappingURL=MigrationReporter.js.map