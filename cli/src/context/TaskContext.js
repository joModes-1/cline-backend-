/**
 * React Context for task state management in CLI
 * Provides access to ExtensionState and task controller
 */
import { registerPartialMessageCallback } from "@core/controller/ui/subscribeToPartialMessage";
import { convertProtoToClineMessage } from "@shared/proto-conversions/cline-message";
import React, { createContext, useContext, useEffect, useRef, useState } from "react";
const TaskContext = createContext(undefined);
export const TaskContextProvider = ({ controller, children }) => {
    const [state, setState] = useState(() => ({
        clineMessages: [],
        currentTaskItem: null,
    }));
    const [isComplete, setIsComplete] = useState(false);
    const [lastError, setLastError] = useState(null);
    // Use ref to track latest state for partial message callback
    const stateRef = useRef(state);
    stateRef.current = state;
    // Subscribe to controller state updates
    useEffect(() => {
        const originalPostState = controller.postStateToWebview.bind(controller);
        const handleStateUpdate = async () => {
            try {
                const newState = await controller.getStateToPostToWebview();
                // Ignore transient empty messages state during cancel/reinit
                // When clearTask() runs, messages briefly become [] before new task loads them
                const hadMessages = (stateRef.current.clineMessages?.length ?? 0) > 0;
                const hasMessages = (newState.clineMessages?.length ?? 0) > 0;
                if (hadMessages && !hasMessages) {
                    return;
                }
                setState(newState);
            }
            catch (error) {
                setLastError(error instanceof Error ? error.message : String(error));
            }
        };
        // Override postStateToWebview to update React state
        controller.postStateToWebview = async () => {
            await originalPostState();
            await handleStateUpdate();
        };
        // Subscribe to partial message events (for streaming updates)
        const unsubscribePartial = registerPartialMessageCallback((protoMessage) => {
            const updatedMessage = convertProtoToClineMessage(protoMessage);
            setState((prevState) => {
                const messages = prevState.clineMessages || [];
                // Find and update the message by timestamp
                const index = messages.findIndex((m) => m.ts === updatedMessage.ts);
                if (index >= 0) {
                    const newMessages = [...messages];
                    newMessages[index] = updatedMessage;
                    return { ...prevState, clineMessages: newMessages };
                }
                return prevState;
            });
        });
        // Get initial state
        handleStateUpdate();
        // Cleanup
        return () => {
            controller.postStateToWebview = originalPostState;
            unsubscribePartial();
        };
    }, [controller]);
    // Force clear state (bypasses the empty messages check for intentional clears like /clear)
    const clearState = () => {
        setState({
            clineMessages: [],
            currentTaskItem: null,
        });
    };
    const value = {
        state,
        controller,
        isComplete,
        setIsComplete,
        lastError,
        setLastError,
        clearState,
    };
    return React.createElement(TaskContext.Provider, { value: value }, children);
};
/**
 * Hook to access task context
 */
export const useTaskContext = () => {
    const context = useContext(TaskContext);
    if (!context) {
        throw new Error("useTaskContext must be used within TaskContextProvider");
    }
    return context;
};
/**
 * Hook to access task state only
 */
export const useTaskState = () => {
    const { state } = useTaskContext();
    return state;
};
/**
 * Hook to access controller
 */
export const useTaskController = () => {
    const { controller } = useTaskContext();
    return controller;
};
//# sourceMappingURL=TaskContext.js.map