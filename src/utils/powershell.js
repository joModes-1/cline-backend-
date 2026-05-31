import * as childProcess from "child_process";
import { Logger } from "@/shared/services/Logger";
import { WINDOWS_POWERSHELL_7_PATH, WINDOWS_POWERSHELL_LEGACY_PATH } from "./shell";
const POWERSHELL_PROBE_TIMEOUT_MS = 1200;
let resolvedPowerShellPromise = null;
let probeWindowsExecutableImpl = probeWindowsExecutable;
function uniquePreserveOrder(values) {
    return [...new Set(values.filter(Boolean))];
}
export function getFallbackWindowsPowerShellPath() {
    return WINDOWS_POWERSHELL_LEGACY_PATH;
}
export function getWindowsPowerShellCandidates() {
    const programFiles = process.env.ProgramW6432 || process.env.ProgramFiles || "C:\\Program Files";
    const envAbsoluteCandidates = [
        `${programFiles}\\PowerShell\\7\\pwsh.exe`,
        `${programFiles}\\PowerShell\\6\\pwsh.exe`,
        WINDOWS_POWERSHELL_7_PATH,
        WINDOWS_POWERSHELL_LEGACY_PATH,
    ];
    const commandNameFallbacks = ["pwsh.exe", "pwsh", "powershell.exe", "powershell"];
    return uniquePreserveOrder([...envAbsoluteCandidates, ...commandNameFallbacks]);
}
export function resetPowerShellResolverCacheForTesting() {
    resolvedPowerShellPromise = null;
    probeWindowsExecutableImpl = probeWindowsExecutable;
}
export function setPowerShellProbeForTesting(probeFn) {
    probeWindowsExecutableImpl = probeFn ?? probeWindowsExecutable;
}
export async function probeWindowsExecutable(candidate, timeoutMs = POWERSHELL_PROBE_TIMEOUT_MS) {
    return await new Promise((resolve) => {
        const child = childProcess.spawn(candidate, ["-NoProfile", "-NonInteractive", "-Command", "$PSVersionTable.PSVersion"], {
            stdio: "ignore",
            windowsHide: true,
            shell: false,
        });
        let settled = false;
        const finish = (isAvailable) => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timer);
            resolve(isAvailable);
        };
        const timer = setTimeout(() => {
            if (!child.killed) {
                child.kill("SIGTERM");
            }
            finish(false);
        }, timeoutMs);
        child.once("error", () => finish(false));
        child.once("exit", (code) => finish(code === 0));
    });
}
export async function resolveWindowsPowerShellExecutable() {
    if (!resolvedPowerShellPromise) {
        resolvedPowerShellPromise = (async () => {
            const candidates = getWindowsPowerShellCandidates();
            for (const candidate of candidates) {
                if (await probeWindowsExecutableImpl(candidate)) {
                    Logger.debug(`[PowerShellResolver] Using PowerShell executable: ${candidate}`);
                    return candidate;
                }
            }
            const fallback = getFallbackWindowsPowerShellPath();
            Logger.warn(`[PowerShellResolver] Could not resolve PowerShell executable from candidates ${candidates.join(", ")}. Falling back to ${fallback}.`);
            return fallback;
        })();
    }
    return resolvedPowerShellPromise;
}
//# sourceMappingURL=powershell.js.map