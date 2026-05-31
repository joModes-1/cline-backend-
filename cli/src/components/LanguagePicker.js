/**
 * Language picker component for user preference
 */
import React, { useMemo } from "react";
import { SearchableList } from "./SearchableList";
// Available languages - English names only to avoid Unicode rendering issues
const LANGUAGES = [
    "English",
    "Arabic",
    "Czech",
    "French",
    "German",
    "Hindi",
    "Hungarian",
    "Italian",
    "Japanese",
    "Korean",
    "Polish",
    "Portuguese (Brazil)",
    "Portuguese (Portugal)",
    "Russian",
    "Simplified Chinese",
    "Spanish",
    "Traditional Chinese",
    "Turkish",
];
export const LanguagePicker = ({ onSelect, isActive = true }) => {
    const items = useMemo(() => LANGUAGES.map((lang) => ({
        id: lang,
        label: lang,
    })), []);
    return React.createElement(SearchableList, { isActive: isActive, items: items, onSelect: (item) => onSelect(item.id) });
};
//# sourceMappingURL=LanguagePicker.js.map