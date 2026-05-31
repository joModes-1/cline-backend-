/**
 * Loading spinner component using ink-spinner
 */
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import React from "react";
export const LoadingSpinner = ({ mode = "act" }) => {
    const message = mode === "plan" ? "Planning" : "Thinking";
    return (React.createElement(Box, null,
        React.createElement(Text, { color: "cyan" },
            React.createElement(Spinner, { type: "dots" })),
        React.createElement(Text, { color: "cyan" },
            " ",
            message,
            "...")));
};
//# sourceMappingURL=Spinner.js.map