/**
 * Context for tracking stdin raw mode support
 * Used to conditionally disable input handling when stdin doesn't support raw mode
 * (e.g., when input is piped: echo "..." | clinedev)
 */
import React, { createContext, useContext } from "react";
const StdinContext = createContext({ isRawModeSupported: true });
export const useStdinContext = () => useContext(StdinContext);
export const StdinProvider = ({ children, isRawModeSupported }) => {
    return React.createElement(StdinContext.Provider, { value: { isRawModeSupported } }, children);
};
/**
 * Check if stdin supports raw mode
 * Returns false when input is piped or stdin is not a TTY
 */
export function checkRawModeSupport() {
    return Boolean(process.stdin.isTTY && typeof process.stdin.setRawMode === "function");
}
//# sourceMappingURL=StdinContext.js.map