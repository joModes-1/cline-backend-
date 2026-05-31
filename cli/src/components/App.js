/**
 * Main App component for Ink CLI
 * Routes between different views (task, history, config)
 */
import { Box, useApp } from "ink";
import React, { useCallback, useEffect, useState } from "react";
import { StdinProvider } from "../context/StdinContext";
import { TaskContextProvider } from "../context/TaskContext";
import { useTerminalSize } from "../hooks/useTerminalSize";
import { AuthView } from "./AuthView";
import { ChatView } from "./ChatView";
import { ConfigView } from "./ConfigView";
import { ErrorBoundary } from "./ErrorBoundary";
import { HistoryView } from "./HistoryView";
import { TaskJsonView } from "./TaskJsonView";
export const App = (props) => {
    const { exit } = useApp();
    return (React.createElement(ErrorBoundary, { exit: exit },
        React.createElement(InternalApp, { ...props })));
};
const InternalApp = ({ view: initialView, taskId, verbose = false, jsonOutput = false, controller, onComplete, onError, historyItems = [], historyAllItems, historyPagination, onHistoryPageChange, dataDir = "", globalState = {}, workspaceState = {}, 
// Rules
globalClineRulesToggles, localClineRulesToggles, localCursorRulesToggles, localWindsurfRulesToggles, localAgentsRulesToggles, onToggleRule, 
// Workflows
globalWorkflowToggles, localWorkflowToggles, onToggleWorkflow, 
// Hooks
hooksEnabled, globalHooks, workspaceHooks, onToggleHook, 
// Skills
skillsEnabled, globalSkills, localSkills, onToggleSkill, onWelcomeSubmit, onWelcomeExit, initialPrompt, initialImages, isRawModeSupported = true, }) => {
    const { resizeKey } = useTerminalSize();
    const [currentView, setCurrentView] = useState(initialView);
    const [selectedTaskId, setSelectedTaskId] = useState(taskId);
    const [pendingInitialPrompt, setPendingInitialPrompt] = useState(initialPrompt);
    const [pendingInitialImages, setPendingInitialImages] = useState(initialImages);
    useEffect(() => {
        if (!pendingInitialPrompt && (!pendingInitialImages || pendingInitialImages.length === 0)) {
            return;
        }
        setPendingInitialPrompt(undefined);
        setPendingInitialImages(undefined);
    }, [pendingInitialPrompt, pendingInitialImages]);
    const handleSelectTask = useCallback((taskId) => {
        setSelectedTaskId(taskId);
        setCurrentView("task");
    }, []);
    const handleNavigateToWelcome = useCallback(() => {
        setCurrentView("welcome");
    }, []);
    // Handle welcome submit when navigating internally (e.g., from auth -> welcome)
    const _handleInternalWelcomeSubmit = useCallback(async (prompt, imagePaths) => {
        if (onWelcomeSubmit) {
            // If external handler provided, use it
            onWelcomeSubmit(prompt, imagePaths);
        }
        else if (controller && prompt.trim()) {
            // Otherwise, start a task directly via controller
            setCurrentView("task");
            // Convert image paths to data URLs if needed
            const imageDataUrls = imagePaths.length > 0
                ? await Promise.all(imagePaths.map(async (p) => {
                    try {
                        const fs = await import("fs/promises");
                        const path = await import("path");
                        const data = await fs.readFile(p);
                        const ext = path.extname(p).toLowerCase().slice(1);
                        const mimeType = ext === "jpg" ? "jpeg" : ext;
                        return `data:image/${mimeType};base64,${data.toString("base64")}`;
                    }
                    catch {
                        return null;
                    }
                }))
                : [];
            const validImages = imageDataUrls.filter((img) => img !== null);
            await controller.initTask(prompt.trim(), validImages.length > 0 ? validImages : undefined);
        }
    }, [onWelcomeSubmit, controller]);
    let content;
    switch (currentView) {
        case "history":
            content = (React.createElement(HistoryView, { allItems: historyAllItems, controller: controller, items: historyItems, onPageChange: onHistoryPageChange, onSelectTask: handleSelectTask, pagination: historyPagination }));
            break;
        case "config":
            content = (React.createElement(ConfigView, { dataDir: dataDir, globalClineRulesToggles: globalClineRulesToggles, globalHooks: globalHooks, globalSkills: globalSkills, globalState: globalState, globalWorkflowToggles: globalWorkflowToggles, hooksEnabled: hooksEnabled, localAgentsRulesToggles: localAgentsRulesToggles, localClineRulesToggles: localClineRulesToggles, localCursorRulesToggles: localCursorRulesToggles, localSkills: localSkills, localWindsurfRulesToggles: localWindsurfRulesToggles, localWorkflowToggles: localWorkflowToggles, onToggleHook: onToggleHook, onToggleRule: onToggleRule, onToggleSkill: onToggleSkill, onToggleWorkflow: onToggleWorkflow, skillsEnabled: skillsEnabled, workspaceHooks: workspaceHooks, workspaceState: workspaceState }));
            break;
        case "auth":
            content = (React.createElement(AuthView, { controller: controller, onComplete: onComplete, onError: onError, onNavigateToWelcome: handleNavigateToWelcome }));
            break;
        case "task":
        case "welcome":
            content = (React.createElement(TaskContextProvider, { controller: controller }, jsonOutput ? (React.createElement(TaskJsonView, { onComplete: onComplete, onError: onError, taskId: selectedTaskId, verbose: verbose })) : (React.createElement(ChatView, { controller: controller, initialImages: pendingInitialImages, initialPrompt: pendingInitialPrompt, onComplete: onComplete, onError: onError, onExit: onWelcomeExit, taskId: selectedTaskId }))));
            break;
        default:
            content = null;
    }
    return (React.createElement(StdinProvider, { isRawModeSupported: isRawModeSupported },
        React.createElement(Box, { key: resizeKey }, content)));
};
//# sourceMappingURL=App.js.map