/**
 * Slash command utilities for CLI
 * Handles detection, filtering, and insertion of slash commands
 */
import { CLI_ONLY_COMMANDS } from "@shared/slashCommands";
import { fuzzyFilter } from "./fuzzy-search";
export function createCliOnlySlashCommands() {
    return CLI_ONLY_COMMANDS.map((cmd) => ({
        name: cmd.name,
        description: cmd.description || "",
        section: cmd.section || "default",
        cliCompatible: true,
    }));
}
/**
 * Calculate visible window for a scrollable list menu.
 * Centers the selected item in the visible window when possible.
 * Returns the visible items and the start index for selection tracking.
 */
export function getVisibleWindow(items, selectedIndex, maxVisible = 5) {
    if (items.length <= maxVisible) {
        return { items, startIndex: 0 };
    }
    const halfWindow = Math.floor(maxVisible / 2);
    let startIndex = Math.max(0, selectedIndex - halfWindow);
    const endIndex = Math.min(items.length, startIndex + maxVisible);
    // Adjust if we're near the end
    if (endIndex - startIndex < maxVisible) {
        startIndex = Math.max(0, endIndex - maxVisible);
    }
    return { items: items.slice(startIndex, endIndex), startIndex };
}
/**
 * Sort commands with workflows (custom section) first, then default commands.
 */
export function sortCommandsWorkflowsFirst(commands) {
    return [...commands.filter((cmd) => cmd.section === "custom"), ...commands.filter((cmd) => cmd.section !== "custom")];
}
/**
 * Extract slash command query from input text.
 * Returns info about whether we're in slash mode and what the query is.
 * Takes cursor position to only examine text before cursor (matching webview behavior).
 */
export function extractSlashQuery(text, cursorPosition) {
    // Use text up to cursor position (or full text if no cursor position provided)
    const beforeCursor = cursorPosition !== undefined ? text.slice(0, cursorPosition) : text;
    // Find the last slash before cursor
    const slashIndex = beforeCursor.lastIndexOf("/");
    if (slashIndex === -1) {
        return { inSlashMode: false, query: "", slashIndex: -1 };
    }
    // Slash must be at start or preceded by whitespace
    const charBeforeSlash = slashIndex > 0 ? beforeCursor[slashIndex - 1] : null;
    if (charBeforeSlash !== null && !/\s/.test(charBeforeSlash)) {
        return { inSlashMode: false, query: "", slashIndex: -1 };
    }
    // Get text after slash (up to cursor)
    const textAfterSlash = beforeCursor.slice(slashIndex + 1);
    // If there's whitespace after slash, we're not in slash mode anymore
    if (/\s/.test(textAfterSlash)) {
        return { inSlashMode: false, query: "", slashIndex: -1 };
    }
    // Check if there's already a completed slash command earlier in the text
    // (only first slash command per message is processed)
    const firstSlashCommandRegex = /(^|\s)\/[a-zA-Z0-9_.-]+\s/;
    const textBeforeCurrentSlash = text.slice(0, slashIndex);
    if (firstSlashCommandRegex.test(textBeforeCurrentSlash)) {
        return { inSlashMode: false, query: "", slashIndex: -1 };
    }
    return {
        inSlashMode: true,
        query: textAfterSlash,
        slashIndex,
    };
}
/**
 * Detect a standalone slash command (for example "/q" or "/exit")
 * that should be executed immediately when enter is pressed.
 */
export function getStandaloneSlashCommandName(text) {
    const match = text.trim().match(/^\/([a-zA-Z0-9_.-]+)$/);
    return match?.[1] ?? null;
}
/**
 * Resolve whether pressing Enter should execute a standalone CLI slash command.
 * This keeps ChatView's key handling deterministic and easy to test.
 */
export function getStandaloneSlashCommandToExecute({ prompt, inSlashMode, hasSlashMenu, hasPendingAsk, isSpinnerActive, }) {
    const standaloneSlashCommand = getStandaloneSlashCommandName(prompt);
    if (!standaloneSlashCommand) {
        return null;
    }
    if (hasPendingAsk || isSpinnerActive) {
        return null;
    }
    if (inSlashMode && hasSlashMenu) {
        return null;
    }
    return standaloneSlashCommand;
}
/**
 * Filter commands using fuzzy matching
 */
export function filterCommands(commands, query) {
    if (!query) {
        return commands;
    }
    const normalizedQuery = query.toLowerCase();
    const exactMatches = [];
    const prefixMatches = [];
    const remaining = [];
    for (const command of commands) {
        const normalizedName = command.name.toLowerCase();
        if (normalizedName === normalizedQuery) {
            exactMatches.push(command);
            continue;
        }
        if (normalizedName.startsWith(normalizedQuery)) {
            prefixMatches.push(command);
            continue;
        }
        remaining.push(command);
    }
    return [...exactMatches, ...prefixMatches, ...fuzzyFilter(remaining, query, (cmd) => cmd.name)];
}
/**
 * Insert a slash command at the given slash index, replacing any partial query
 */
export function insertSlashCommand(text, slashIndex, commandName) {
    const beforeSlash = text.slice(0, slashIndex);
    // Insert command with trailing space
    return `${beforeSlash}/${commandName} `;
}
//# sourceMappingURL=slash-commands.js.map