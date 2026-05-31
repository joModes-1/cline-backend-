import { Box, Text } from "ink";
import React from "react";
import { ErrorService } from "@/services/error";
import { StaticRobotFrame } from "./AsciiMotionCli";
async function onReactError(props, error, errorInfo) {
    try {
        await ErrorService.get().captureException(error, { context: "ErrorBoundary", errorInfo });
        await ErrorService.get().dispose();
    }
    catch {
        // Ignore errors
    }
    finally {
        props.exit(error);
    }
}
export class ErrorBoundary extends React.Component {
    state = { hasError: false };
    constructor(props) {
        super(props);
    }
    componentDidCatch(error, errorInfo) {
        onReactError(this.props, error, errorInfo);
    }
    static getDerivedStateFromError() {
        return { hasError: true };
    }
    render() {
        if (this.state.hasError) {
            return (React.createElement(Box, { flexDirection: "column", height: "100%", key: "header", width: "100%" },
                React.createElement(StaticRobotFrame, null),
                React.createElement(Text, null, " "),
                React.createElement(Text, { bold: true, color: "white" }, "Something went wrong. We're sorry."),
                React.createElement(Text, { color: "white" }, "Please check the logs for more details."),
                React.createElement(Text, null, " ")));
        }
        return this.props.children;
    }
}
//# sourceMappingURL=ErrorBoundary.js.map