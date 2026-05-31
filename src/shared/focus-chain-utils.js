/**
 * Shared utility functions for focus chain pattern matching
 * Used by both extension and webview
 *  */
/**
 * Checks if a trimmed line matches focus chain item patterns
 * @param line The trimmed line to check
 * @returns true if the line is a focus chain item (- [ ], - [x], or - [X])
 */
export function isFocusChainItem(line) {
    return line.startsWith("- [ ]") || line.startsWith("- [x]") || line.startsWith("- [X]");
}
/**
 * Checks if a trimmed line is a completed focus chain item
 * @param line The trimmed line to check
 * @returns true if the line is a completed focus chain item (- [x] or - [X])
 */
export function isCompletedFocusChainItem(line) {
    return line.startsWith("- [x]") || line.startsWith("- [X]");
}
/**
 * Flexible regex pattern for matching focus chain items with spacing variations
 * Matches patterns like "- [x] text", "- [X] text", "- [ ] text", "-  [ ]  text", etc.
 */
export const FOCUS_CHAIN_ITEM_REGEX = /^-\s*\[([ xX])\]\s*(.+)$/;
/**
 * Parse focus chain item using flexible regex (allows spacing variations)
 * @param line The trimmed line to parse
 * @returns Object with checked status and text, or null if not a focus chain item
 */
export function parseFocusChainItem(line) {
    const match = line.match(FOCUS_CHAIN_ITEM_REGEX);
    if (match) {
        const checked = match[1] === "x" || match[1] === "X";
        const text = match[2].trim();
        return { checked, text };
    }
    return null;
}
//# sourceMappingURL=focus-chain-utils.js.map