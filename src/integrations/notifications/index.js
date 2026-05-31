import { execa } from "execa";
import { platform } from "os";
import { Logger } from "@/shared/services/Logger";
const EXPLICIT_APPROVAL_NOTIFICATION_SUFFIX = " (explicit approval required)";
const MAX_APPROVAL_NOTIFICATION_LENGTH = 140;
let execaImpl = execa;
let platformImpl = platform;
export function setNotificationExecaForTesting(mock) {
    execaImpl = mock ?? execa;
}
export function setNotificationPlatformForTesting(mock) {
    platformImpl = mock ?? platform;
}
function escapeAppleScriptString(value) {
    return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
export function escapePowerShellSingleQuotedString(value) {
    return value.replace(/'/g, "''");
}
export function encodePowerShellCommand(command) {
    return Buffer.from(command, "utf16le").toString("base64");
}
function abbreviateNotificationMessage(message, maxLength) {
    const normalizedMessage = message.replace(/\s+/g, " ").trim();
    if (normalizedMessage.length <= maxLength) {
        return normalizedMessage;
    }
    return `${normalizedMessage.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}
export function createApprovalNotificationMessage(options) {
    const suffix = options.requiresExplicitApproval ? EXPLICIT_APPROVAL_NOTIFICATION_SUFFIX : "";
    const availableMessageLength = Math.max(0, MAX_APPROVAL_NOTIFICATION_LENGTH - suffix.length);
    const abbreviatedMessage = abbreviateNotificationMessage(options.message, availableMessageLength);
    return `${abbreviatedMessage}${suffix}`;
}
/**
 * Note: `title` is not rendered on Windows because the ToastText02 template only exposes
 * two text slots, which we use for subtitle (id=1) and message (id=2).
 */
export function buildWindowsToastNotificationScript(options) {
    const { subtitle = "", message } = options;
    const safeSubtitle = escapePowerShellSingleQuotedString(subtitle);
    const safeMessage = escapePowerShellSingleQuotedString(message);
    return `
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
    [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null

    $subtitle = '${safeSubtitle}'
    $message = '${safeMessage}'

    $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
    $xml.LoadXml('<toast><visual><binding template="ToastText02"><text id="1"></text><text id="2"></text></binding></visual></toast>')

    $textNodes = $xml.GetElementsByTagName('text')
    $textNodes.Item(0).InnerText = $subtitle
    $textNodes.Item(1).InnerText = $message

    $toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Cline').Show($toast)
    `;
}
async function showMacOSNotification(options) {
    const { title, subtitle = "", message } = options;
    const script = `display notification "${escapeAppleScriptString(message)}" with title "${escapeAppleScriptString(title || "")}" subtitle "${escapeAppleScriptString(subtitle)}" sound name "Tink"`;
    try {
        await execaImpl("osascript", ["-e", script]);
    }
    catch (error) {
        throw new Error(`Failed to show macOS notification: ${error}`);
    }
}
async function showWindowsNotification(options) {
    const script = buildWindowsToastNotificationScript(options);
    const encodedScript = encodePowerShellCommand(script);
    try {
        await execaImpl("powershell", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encodedScript]);
    }
    catch (error) {
        throw new Error(`Failed to show Windows notification: ${error}`);
    }
}
async function showLinuxNotification(options) {
    const { title = "", subtitle = "", message } = options;
    // Combine subtitle and message if subtitle exists
    const fullMessage = subtitle ? `${subtitle}\n${message}` : message;
    try {
        await execaImpl("notify-send", [title, fullMessage]);
    }
    catch (error) {
        throw new Error(`Failed to show Linux notification: ${error}`);
    }
}
export async function showSystemNotification(options) {
    try {
        const { title = "Cline", message } = options;
        if (!message) {
            throw new Error("Message is required");
        }
        const normalizedOptions = {
            ...options,
            title,
            subtitle: options.subtitle || "",
        };
        switch (platformImpl()) {
            case "darwin":
                await showMacOSNotification(normalizedOptions);
                break;
            case "win32":
                await showWindowsNotification(normalizedOptions);
                break;
            case "linux":
                await showLinuxNotification(normalizedOptions);
                break;
            default:
                throw new Error("Unsupported platform");
        }
    }
    catch (error) {
        Logger.error("Could not show system notification", error);
    }
}
export async function showApprovalNotification(options, notificationsEnabled) {
    if (!notificationsEnabled) {
        return;
    }
    await showSystemNotification({
        subtitle: "Approval Required",
        message: createApprovalNotificationMessage(options),
    });
}
//# sourceMappingURL=index.js.map