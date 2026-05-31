/**
 * Acting/Planning indicator with spinner, shimmer effect, and elapsed time
 */
import { Box, Text, useInput } from "ink";
import React, { useEffect, useMemo, useState } from "react";
import { COLORS } from "../constants/colors";
// Spinner frames (dots style from ink-spinner)
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SHIMMER_WIDTH = 3; // How many characters are "bright" at once
/**
 * Format elapsed time as "1m 5s" or "45s"
 */
function formatElapsedTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
}
/**
 * Render text with a shimmer effect using bold for bright characters
 */
const ShimmerText = ({ text, color, shimmerPos }) => {
    const chars = text.split("");
    return (React.createElement(Text, null, chars.map((char, i) => {
        const distFromShimmer = Math.abs(i - shimmerPos);
        const isBright = distFromShimmer <= SHIMMER_WIDTH;
        return (React.createElement(Text, { bold: isBright, color: color, dimColor: !isBright, key: i }, char));
    })));
};
export const ThinkingIndicator = ({ mode = "act", startTime, onCancel }) => {
    const message = mode === "plan" ? "Planning" : "Acting";
    const color = mode === "plan" ? "yellow" : COLORS.primaryBlue;
    // Handle esc key to cancel
    useInput((_input, key) => {
        if (key.escape && onCancel) {
            onCancel();
        }
    });
    // Spinner frame index
    const [spinnerFrame, setSpinnerFrame] = useState(0);
    // Shimmer position
    const [shimmerPos, setShimmerPos] = useState(-SHIMMER_WIDTH);
    // Elapsed time state
    const [elapsedMs, setElapsedMs] = useState(0);
    const spinnerChar = SPINNER_FRAMES[spinnerFrame];
    const fullText = `${spinnerChar} ${message}...`;
    // Animate spinner
    useEffect(() => {
        const interval = setInterval(() => {
            setSpinnerFrame((prev) => (prev + 1) % SPINNER_FRAMES.length);
        }, 80);
        return () => clearInterval(interval);
    }, []);
    // Animate shimmer
    useEffect(() => {
        const interval = setInterval(() => {
            setShimmerPos((prev) => {
                const next = prev + 1;
                if (next > fullText.length + SHIMMER_WIDTH) {
                    return -SHIMMER_WIDTH;
                }
                return next;
            });
        }, 100);
        return () => clearInterval(interval);
    }, [fullText.length]);
    // Update elapsed time
    useEffect(() => {
        if (!startTime)
            return;
        const updateElapsed = () => {
            setElapsedMs(Date.now() - startTime);
        };
        updateElapsed(); // Initial update
        const interval = setInterval(updateElapsed, 1000);
        return () => clearInterval(interval);
    }, [startTime]);
    const elapsedStr = useMemo(() => {
        if (!startTime)
            return null;
        return formatElapsedTime(elapsedMs);
    }, [startTime, elapsedMs]);
    return (React.createElement(Box, { paddingLeft: 1 },
        React.createElement(ShimmerText, { color: color, shimmerPos: shimmerPos, text: fullText }),
        elapsedStr && React.createElement(Text, { color: "gray" },
            " (",
            elapsedStr,
            " \u00B7 esc to interrupt)")));
};
//# sourceMappingURL=ThinkingIndicator.js.map