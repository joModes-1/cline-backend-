import { userInfo } from "os";
let vscodeModule;
async function getVscodeModule() {
    if (vscodeModule !== undefined) {
        return vscodeModule;
    }
    try {
        vscodeModule = await import("vscode");
        return vscodeModule;
    }
    catch {
        vscodeModule = null;
        return null;
    }
}
export const WINDOWS_POWERSHELL_7_PATH = "C:\\Program Files\\PowerShell\\7\\pwsh.exe";
export const WINDOWS_POWERSHELL_LEGACY_PATH = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
const SHELL_PATHS = {
    // Windows paths
    POWERSHELL_7: WINDOWS_POWERSHELL_7_PATH,
    POWERSHELL_LEGACY: WINDOWS_POWERSHELL_LEGACY_PATH,
    CMD: "C:\\Windows\\System32\\cmd.exe",
    WSL_BASH: "/bin/bash",
    GIT_BASH: "C:\\Program Files\\Git\\bin\\bash.exe",
    // Unix paths
    MAC_DEFAULT: "/bin/zsh",
    LINUX_DEFAULT: "/bin/bash",
    CSH: "/bin/csh",
    BASH: "/bin/bash",
    KSH: "/bin/ksh",
    SH: "/bin/sh",
    ZSH: "/bin/zsh",
    DASH: "/bin/dash",
    TCSH: "/bin/tcsh",
    FALLBACK: "/bin/sh",
};
// -----------------------------------------------------
// 1) VS Code Terminal Configuration Helpers
// -----------------------------------------------------
function getWindowsTerminalConfig() {
    try {
        // In standalone/web builds, vscode may not be available.
        return { defaultProfileName: null, profiles: {} };
    }
    catch {
        return { defaultProfileName: null, profiles: {} };
    }
}
function getMacTerminalConfig() {
    try {
        return { defaultProfileName: null, profiles: {} };
    }
    catch {
        return { defaultProfileName: null, profiles: {} };
    }
}
function getLinuxTerminalConfig() {
    try {
        return { defaultProfileName: null, profiles: {} };
    }
    catch {
        return { defaultProfileName: null, profiles: {} };
    }
}
// -----------------------------------------------------
// 2) Platform-Specific VS Code Shell Retrieval
// -----------------------------------------------------
/** Attempts to retrieve a shell path from VS Code config on Windows. */
function getWindowsShellFromVSCode() {
    // Standalone/web builds do not have access to VS Code configuration.
    return null;
}
/** Attempts to retrieve a shell path from VS Code config on macOS. */
function getMacShellFromVSCode() {
    // Standalone/web builds do not have access to VS Code configuration.
    return null;
}
/** Attempts to retrieve a shell path from VS Code config on Linux. */
function getLinuxShellFromVSCode() {
    // Standalone/web builds do not have access to VS Code configuration.
    return null;
}
// -----------------------------------------------------
// 3) General Fallback Helpers
// -----------------------------------------------------
/**
 * Tries to get a user’s shell from os.userInfo() (works on Unix if the
 * underlying system call is supported). Returns null on error or if not found.
 */
function getShellFromUserInfo() {
    try {
        const { shell } = userInfo();
        return shell || null;
    }
    catch {
        return null;
    }
}
/** Returns the environment-based shell variable, or null if not set. */
function getShellFromEnv() {
    const { env } = process;
    if (process.platform === "win32") {
        // On Windows, COMSPEC typically holds cmd.exe
        return env.COMSPEC || "C:\\Windows\\System32\\cmd.exe";
    }
    if (process.platform === "darwin") {
        // On macOS/Linux, SHELL is commonly the environment variable
        return env.SHELL || "/bin/zsh";
    }
    if (process.platform === "linux") {
        // On Linux, SHELL is commonly the environment variable
        return env.SHELL || "/bin/bash";
    }
    return null;
}
/** Gets available terminal profiles for the current platform */
export function getAvailableTerminalProfiles() {
    const profiles = [
        {
            id: "default",
            name: "Default",
            description: "Use VSCode's default terminal configuration",
        },
    ];
    if (process.platform === "win32") {
        // Windows terminal profiles
        profiles.push({
            id: "powershell-7",
            name: "PowerShell 7",
            path: SHELL_PATHS.POWERSHELL_7,
            description: "PowerShell 7 (pwsh.exe)",
        }, {
            id: "powershell-legacy",
            name: "Windows PowerShell",
            path: SHELL_PATHS.POWERSHELL_LEGACY,
            description: "Windows PowerShell 5.x",
        }, {
            id: "cmd",
            name: "Command Prompt",
            path: SHELL_PATHS.CMD,
            description: "Command Prompt (cmd.exe)",
        }, {
            id: "wsl-bash",
            name: "WSL Bash",
            path: SHELL_PATHS.WSL_BASH,
            description: "Windows Subsystem for Linux Bash",
        }, {
            id: "git-bash",
            name: "Git Bash",
            path: SHELL_PATHS.GIT_BASH,
            description: "Git Bash (bash.exe from Git for Windows)",
        });
    }
    else if (process.platform === "darwin") {
        // macOS terminal profiles
        profiles.push({
            id: "zsh",
            name: "zsh",
            path: SHELL_PATHS.ZSH,
            description: "Z shell (default on macOS)",
        }, {
            id: "bash",
            name: "bash",
            path: SHELL_PATHS.BASH,
            description: "Bourne Again Shell",
        });
    }
    else if (process.platform === "linux") {
        // Linux terminal profiles
        profiles.push({
            id: "bash",
            name: "bash",
            path: SHELL_PATHS.BASH,
            description: "Bourne Again Shell (default on most Linux)",
        }, {
            id: "zsh",
            name: "zsh",
            path: SHELL_PATHS.ZSH,
            description: "Z shell",
        }, {
            id: "dash",
            name: "dash",
            path: SHELL_PATHS.DASH,
            description: "Debian Almquist Shell",
        });
    }
    return profiles;
}
/** Gets the shell path for a specific terminal profile */
export function getShellForProfile(profileId) {
    // If it's the default profile, use the existing getShell() logic
    if (profileId === "default") {
        return getShell();
    }
    // Find the profile
    const profiles = getAvailableTerminalProfiles();
    const profile = profiles.find((p) => p.id === profileId);
    if (profile?.path) {
        return profile.path;
    }
    // Fallback to default shell if profile not found
    return getShell();
}
// -----------------------------------------------------
// 5) Publicly Exposed Shell Getter
// -----------------------------------------------------
export function getShell() {
    // 1. Check VS Code config first.
    if (process.platform === "win32") {
        // Special logic for Windows
        const windowsShell = getWindowsShellFromVSCode();
        if (windowsShell) {
            return windowsShell;
        }
    }
    else if (process.platform === "darwin") {
        // macOS from VS Code
        const macShell = getMacShellFromVSCode();
        if (macShell) {
            return macShell;
        }
    }
    else if (process.platform === "linux") {
        // Linux from VS Code
        const linuxShell = getLinuxShellFromVSCode();
        if (linuxShell) {
            return linuxShell;
        }
    }
    // 2. If no shell from VS Code, try userInfo()
    const userInfoShell = getShellFromUserInfo();
    if (userInfoShell) {
        return userInfoShell;
    }
    // 3. If still nothing, try environment variable
    const envShell = getShellFromEnv();
    if (envShell) {
        return envShell;
    }
    // 4. Finally, fall back to a default
    if (process.platform === "win32") {
        // On Windows, if we got here, we have no config, no COMSPEC, and one very messed up operating system.
        // Use CMD as a last resort
        return SHELL_PATHS.CMD;
    }
    // On macOS/Linux, fallback to a POSIX shell - This is the behavior of our old shell detection method.
    return SHELL_PATHS.FALLBACK;
}
//# sourceMappingURL=shell.js.map