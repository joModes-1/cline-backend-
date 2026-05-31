import { StateManager } from "@/core/storage/StateManager";
import { HostProvider } from "@/hosts/host-provider";
import { getErrorLevelFromString } from "@/services/error";
import { getDistinctId, setDistinctId } from "@/services/logging/distinctId";
import { Setting } from "@/shared/proto/index.host";
import { Logger } from "@/shared/services/Logger";
/**
 * OpenTelemetry implementation of the telemetry provider interface.
 * Handles metrics and event logging using OpenTelemetry standards.
 */
export class OpenTelemetryTelemetryProvider {
    meter = null;
    logger = null;
    telemetrySettings;
    userAttributes = {};
    // Lazy instrument caches for metrics
    counters = new Map();
    histograms = new Map();
    gauges = new Map();
    gaugeValues = new Map();
    meterProvider = null;
    loggerProvider = null;
    name;
    bypassUserSettings;
    constructor(meterProvider, loggerProvider, { name, bypassUserSettings }) {
        this.name = name || "OpenTelemetryProvider";
        this.bypassUserSettings = bypassUserSettings;
        // Initialize telemetry settings
        this.telemetrySettings = {
            hostEnabled: true,
            level: "all",
        };
        if (meterProvider) {
            this.meter = meterProvider.getMeter("cline");
            this.meterProvider = meterProvider;
        }
        if (loggerProvider) {
            this.logger = loggerProvider.getLogger("cline");
            this.loggerProvider = loggerProvider;
        }
        // Log initialization status
        const loggerReady = !!this.logger;
        const meterReady = !!this.meter;
        if (loggerReady || meterReady) {
            Logger.log(`[OTEL] Provider initialized - Logger: ${loggerReady}, Meter: ${meterReady}`);
        }
    }
    async initialize() {
        if (this.bypassUserSettings) {
            return this;
        }
        // Listen for host telemetry changes
        HostProvider.env.subscribeToTelemetrySettings({}, {
            onResponse: (event) => {
                const hostEnabled = event.isEnabled === Setting.ENABLED || event.isEnabled === Setting.UNSUPPORTED;
                this.telemetrySettings.hostEnabled = hostEnabled;
            },
        });
        // Check host-specific telemetry setting (e.g. VS Code setting)
        const hostSettings = await HostProvider.env.getTelemetrySettings({});
        if (hostSettings.isEnabled === Setting.DISABLED) {
            this.telemetrySettings.hostEnabled = false;
        }
        this.telemetrySettings.level = await this.getTelemetryLevel();
        return this;
    }
    async forceFlush() {
        await Promise.all([this.meterProvider?.forceFlush?.(), this.loggerProvider?.forceFlush?.()]);
    }
    log(event, properties) {
        if (!this.isEnabled() || this.telemetrySettings.level === "off") {
            return;
        }
        // Filter events based on telemetry level
        if (this.telemetrySettings.level === "error") {
            if (!event.includes("error")) {
                return;
            }
        }
        // Record log event (primary path)
        if (this.logger) {
            this.logger.emit({
                severityText: "INFO",
                body: event,
                attributes: {
                    distinct_id: getDistinctId(),
                    ...this.flattenProperties(properties),
                    ...this.userAttributes,
                },
            });
        }
    }
    logRequired(event, properties) {
        // Required events always go through regardless of settings
        if (this.logger) {
            this.logger.emit({
                severityText: "INFO",
                body: event,
                attributes: {
                    distinct_id: getDistinctId(),
                    _required: true,
                    ...this.flattenProperties(properties),
                    ...this.userAttributes,
                },
            });
        }
    }
    identifyUser(userInfo, properties = {}) {
        if (!this.isEnabled() || !userInfo) {
            return;
        }
        // Always refresh cached user/org attributes so subsequent logs
        // include up-to-date organization context (e.g. after org switch
        // or extension restart with the same user ID).
        this.userAttributes = this.buildUserAttributes(userInfo, properties);
        const distinctId = getDistinctId();
        // Only emit identification event and update distinct ID when the
        // user ID actually changes (first login or user switch).
        if (userInfo.id !== distinctId) {
            if (this.logger) {
                this.logger.emit({
                    severityText: "INFO",
                    body: "user_identified",
                    attributes: {
                        ...this.userAttributes,
                        alias: distinctId,
                    },
                });
            }
            // Ensure distinct ID is updated so that we will not identify the user again
            setDistinctId(userInfo.id);
        }
    }
    /**
     * Build a flat record of user and organization attributes for use as
     * OpenTelemetry log/event attributes.
     */
    buildUserAttributes(userInfo, properties = {}) {
        const activeOrg = userInfo.organizations?.find((org) => org.active);
        return {
            user_id: userInfo.id,
            user_name: userInfo.displayName || "",
            ...(activeOrg && {
                organization_id: activeOrg.organizationId,
                organization_name: activeOrg.name,
                member_id: activeOrg.memberId,
                member_role: activeOrg.roles[0] || "member",
            }),
            ...this.flattenProperties(properties),
        };
    }
    isEnabled() {
        return (this.bypassUserSettings ||
            (StateManager.get().getGlobalSettingsKey("telemetrySetting") !== "disabled" && this.telemetrySettings.hostEnabled));
    }
    getSettings() {
        return { ...this.telemetrySettings };
    }
    /**
     * Record a counter metric (cumulative value that only increases)
     * Lazy creation - only creates the counter on first use if meter is available.
     */
    recordCounter(name, value, attributes, description, required = false) {
        if (!this.meter || (!required && !this.isEnabled())) {
            return;
        }
        let counter = this.counters.get(name);
        if (!counter) {
            const options = description ? { description } : undefined;
            counter = this.meter.createCounter(name, options);
            this.counters.set(name, counter);
            Logger.log(`[OTEL] Created counter: ${name}`);
        }
        counter.add(value, this.flattenProperties(attributes));
    }
    /**
     * Record a histogram metric (distribution of values for percentile analysis)
     * Lazy creation - only creates the histogram on first use if meter is available.
     */
    recordHistogram(name, value, attributes, description, required = false) {
        if (!this.meter || (!required && !this.isEnabled())) {
            return;
        }
        let histogram = this.histograms.get(name);
        if (!histogram) {
            const options = description ? { description } : undefined;
            histogram = this.meter.createHistogram(name, options);
            this.histograms.set(name, histogram);
            Logger.log(`[OTEL] Created histogram: ${name}`);
        }
        histogram.record(value, this.flattenProperties(attributes));
    }
    /**
     * Record a gauge metric (point-in-time value that can go up or down)
     * Lazy creation - creates an observable gauge that reads from stored values
     */
    recordGauge(name, value, attributes, description, required = false) {
        if (!this.meter || (!required && !this.isEnabled())) {
            return;
        }
        const attrKey = attributes ? JSON.stringify(attributes) : "";
        const existingSeries = this.gaugeValues.get(name);
        if (value === null) {
            if (existingSeries) {
                existingSeries.delete(attrKey);
                if (existingSeries.size === 0) {
                    this.gaugeValues.delete(name);
                    this.gauges.delete(name);
                }
            }
            return;
        }
        let series = existingSeries;
        if (!series) {
            series = new Map();
            this.gaugeValues.set(name, series);
        }
        if (!this.gauges.has(name)) {
            const options = description ? { description } : undefined;
            const gauge = this.meter.createObservableGauge(name, options);
            gauge.addCallback((observableResult) => {
                const snapshot = this.snapshotGaugeSeries(name);
                if (snapshot.length === 0) {
                    return;
                }
                for (const data of snapshot) {
                    observableResult.observe(data.value, this.flattenProperties(data.attributes));
                }
            });
            this.gauges.set(name, gauge);
            Logger.log(`[OTEL] Created gauge: ${name}`);
        }
        series.set(attrKey, { value, attributes });
    }
    snapshotGaugeSeries(name) {
        const series = this.gaugeValues.get(name);
        if (!series) {
            return [];
        }
        const snapshot = [];
        for (const data of series.values()) {
            snapshot.push({
                value: data.value,
                attributes: data.attributes ? { ...data.attributes } : undefined,
            });
        }
        return snapshot;
    }
    async dispose() {
        // OpenTelemetry client provider handles shutdown
        // Individual providers don't need to do anything
    }
    /**
     * Get the current telemetry level from VS Code settings
     */
    async getTelemetryLevel() {
        if (this.bypassUserSettings) {
            return "all";
        }
        const hostSettings = await HostProvider.env.getTelemetrySettings({});
        if (hostSettings.isEnabled === Setting.DISABLED) {
            return "off";
        }
        return getErrorLevelFromString(hostSettings.errorLevel);
    }
    /**
     * Flatten nested properties into dot-notation strings for OpenTelemetry attributes.
     * OpenTelemetry attributes must be primitives (string, number, boolean).
     * Adds protection against circular references, prototype pollution, deep graphs,
     * and limits array sizes to avoid performance issues.
     */
    flattenProperties(properties, prefix = "", seen = new WeakSet(), depth = 0) {
        if (!properties) {
            return {};
        }
        const flattened = {};
        const MAX_ARRAY_SIZE = 100;
        const MAX_DEPTH = 10;
        for (const [key, value] of Object.entries(properties)) {
            // Skip prototype pollution vectors
            if (key === "__proto__" || key === "constructor" || key === "prototype") {
                continue;
            }
            const fullKey = prefix ? `${prefix}.${key}` : key;
            if (value === null || value === undefined) {
                flattened[fullKey] = String(value);
            }
            else if (Array.isArray(value)) {
                // Limit array size to prevent performance issues
                const limited = value.length > MAX_ARRAY_SIZE ? value.slice(0, MAX_ARRAY_SIZE) : value;
                try {
                    flattened[fullKey] = JSON.stringify(limited);
                }
                catch {
                    flattened[fullKey] = "[UnserializableArray]";
                }
                if (value.length > MAX_ARRAY_SIZE) {
                    flattened[`${fullKey}_truncated`] = true;
                    flattened[`${fullKey}_original_length`] = value.length;
                }
            }
            else if (typeof value === "object") {
                // Handle special objects
                if (value instanceof Date) {
                    flattened[fullKey] = value.toISOString();
                    continue;
                }
                if (value instanceof Error) {
                    flattened[fullKey] = value.message;
                    continue;
                }
                // Check for circular references
                if (seen.has(value)) {
                    flattened[fullKey] = "[Circular]";
                    continue;
                }
                // Depth guard
                if (depth >= MAX_DEPTH) {
                    flattened[fullKey] = "[MaxDepthExceeded]";
                    continue;
                }
                seen.add(value);
                Object.assign(flattened, this.flattenProperties(value, fullKey, seen, depth + 1));
            }
            else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
                flattened[fullKey] = value;
            }
            else {
                // Fallback: stringify unknown types
                try {
                    flattened[fullKey] = JSON.stringify(value);
                }
                catch {
                    flattened[fullKey] = String(value);
                }
            }
        }
        return flattened;
    }
}
//# sourceMappingURL=OpenTelemetryTelemetryProvider.js.map