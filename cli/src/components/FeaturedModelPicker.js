/**
 * Featured model picker component
 * Shows curated models with labels (Best, New, Trending, FREE) and optional "Browse all" option
 * Used in both onboarding (AuthView) and settings (SettingsPanelContent)
 */
import { Box, Text } from "ink";
import React from "react";
import { COLORS } from "../constants/colors";
export const FeaturedModelPicker = ({ selectedIndex, title, showBrowseAll = true, helpText = "Arrows to navigate, Enter to select", featuredModels, }) => {
    const models = featuredModels;
    return (React.createElement(Box, { flexDirection: "column" },
        title && (React.createElement(Text, null,
            React.createElement(Text, { bold: true, color: COLORS.primaryBlue }, title),
            React.createElement(Text, null, " "))),
        models.map((model, i) => {
            const isSelected = i === selectedIndex;
            return (React.createElement(Box, { flexDirection: "column", key: `${model.id}-${model.labels[0] || "default"}`, marginBottom: 1 },
                React.createElement(Box, null,
                    React.createElement(Text, { color: isSelected ? COLORS.primaryBlue : undefined }, isSelected ? "❯ " : "  "),
                    React.createElement(Text, { bold: true, color: isSelected ? COLORS.primaryBlue : "white" }, model.name),
                    model.labels.map((label) => (React.createElement(Text, { key: label },
                        React.createElement(Text, null, " "),
                        React.createElement(Text, { backgroundColor: label === "FREE" ? "gray" : COLORS.primaryBlue, color: "black" },
                            " ",
                            label,
                            " "))))),
                React.createElement(Box, { paddingLeft: 2 },
                    React.createElement(Text, { color: "gray" }, model.description))));
        }),
        showBrowseAll && (React.createElement(Box, null,
            React.createElement(Text, { color: selectedIndex === models.length ? COLORS.primaryBlue : "white" },
                selectedIndex === models.length ? "❯ " : "  ",
                "Browse all models..."))),
        React.createElement(Text, null, " "),
        React.createElement(Text, { color: "gray" }, helpText)));
};
/**
 * Get the maximum valid index for the featured model picker
 * (includes "Browse all" option if showBrowseAll is true)
 */
export function getFeaturedModelMaxIndex(featuredModels, showBrowseAll = true) {
    return showBrowseAll ? featuredModels.length : featuredModels.length - 1;
}
/**
 * Check if the selected index is the "Browse all" option
 */
export function isBrowseAllSelected(selectedIndex, featuredModels) {
    return selectedIndex === featuredModels.length;
}
/**
 * Get the featured model at the given index, or null if "Browse all" is selected
 */
export function getFeaturedModelAtIndex(index, featuredModels) {
    if (index >= 0 && index < featuredModels.length) {
        return featuredModels[index];
    }
    return null;
}
//# sourceMappingURL=FeaturedModelPicker.js.map