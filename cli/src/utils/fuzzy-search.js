/**
 * Fuzzy search utility using fzf
 */
import { Fzf } from "fzf";
/**
 * Filter items using fuzzy matching
 * @param items - Array of items to filter
 * @param query - Search query string
 * @param selector - Function to extract searchable string from each item
 * @returns Filtered and sorted items (best matches first)
 */
export function fuzzyFilter(items, query, selector) {
    if (!query)
        return [...items];
    const fzf = new Fzf(items, { selector });
    return fzf.find(query).map((result) => result.item);
}
//# sourceMappingURL=fuzzy-search.js.map