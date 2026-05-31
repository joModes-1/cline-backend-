/**
 * Stateful wrapper for ConfigView that handles toggle operations
 */
import { exec } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { RuleScope } from "@shared/proto/cline/file";
import React, { useCallback, useEffect, useState } from "react";
import { HostProvider } from "@/hosts/host-provider";
import { StdinProvider } from "../context/StdinContext";
import { ConfigView } from "./ConfigView";
export const ConfigViewWrapper = ({ controller, dataDir, globalState: initialGlobalState, workspaceState: initialWorkspaceState, hooksEnabled, skillsEnabled, isRawModeSupported = true, }) => {
    // Settings state (managed locally for UI updates)
    const [globalStateLocal, setGlobalStateLocal] = useState(initialGlobalState);
    const [workspaceStateLocal, setWorkspaceStateLocal] = useState(initialWorkspaceState);
    // Rules state
    const [globalClineRulesToggles, setGlobalClineRulesToggles] = useState({});
    const [localClineRulesToggles, setLocalClineRulesToggles] = useState({});
    const [localCursorRulesToggles, setLocalCursorRulesToggles] = useState({});
    const [localWindsurfRulesToggles, setLocalWindsurfRulesToggles] = useState({});
    const [localAgentsRulesToggles, setLocalAgentsRulesToggles] = useState({});
    // Workflow state
    const [globalWorkflowToggles, setGlobalWorkflowToggles] = useState({});
    const [localWorkflowToggles, setLocalWorkflowToggles] = useState({});
    // Hooks state
    const [globalHooks, setGlobalHooks] = useState([]);
    const [workspaceHooksState, setWorkspaceHooksState] = useState([]);
    // Skills state
    const [globalSkills, setGlobalSkills] = useState([]);
    const [localSkills, setLocalSkills] = useState([]);
    // Load initial data
    useEffect(() => {
        const loadData = async () => {
            const { refreshRules } = await import("@/core/controller/file/refreshRules");
            const { refreshHooks } = await import("@/core/controller/file/refreshHooks");
            const { refreshSkills } = await import("@/core/controller/file/refreshSkills");
            const rulesData = await refreshRules(controller, {});
            setGlobalClineRulesToggles(rulesData.globalClineRulesToggles?.toggles || {});
            setLocalClineRulesToggles(rulesData.localClineRulesToggles?.toggles || {});
            setLocalCursorRulesToggles(rulesData.localCursorRulesToggles?.toggles || {});
            setLocalWindsurfRulesToggles(rulesData.localWindsurfRulesToggles?.toggles || {});
            setLocalAgentsRulesToggles(rulesData.localAgentsRulesToggles?.toggles || {});
            setGlobalWorkflowToggles(rulesData.globalWorkflowToggles?.toggles || {});
            setLocalWorkflowToggles(rulesData.localWorkflowToggles?.toggles || {});
            if (hooksEnabled) {
                const hooksData = await refreshHooks(controller, {});
                setGlobalHooks(hooksData.globalHooks || []);
                setWorkspaceHooksState(hooksData.workspaceHooks || []);
            }
            if (skillsEnabled) {
                const skillsData = await refreshSkills(controller);
                setGlobalSkills(skillsData.globalSkills || []);
                setLocalSkills(skillsData.localSkills || []);
            }
        };
        loadData();
    }, [controller, hooksEnabled, skillsEnabled]);
    // Toggle handlers
    const handleToggleRule = useCallback(async (isGlobal, rulePath, enabled, ruleType) => {
        const { toggleClineRule } = await import("@/core/controller/file/toggleClineRule");
        // Determine scope based on isGlobal and rule type
        const scope = isGlobal ? RuleScope.GLOBAL : RuleScope.LOCAL;
        // For non-cline rules, we need different toggle functions
        if (ruleType === "cursor") {
            // Update local state optimistically
            setLocalCursorRulesToggles((prev) => ({ ...prev, [rulePath]: enabled }));
            // Cursor rules use toggleCursorRule but we'll just update the state manager directly
            const toggles = controller.stateManager.getWorkspaceStateKey("localCursorRulesToggles") || {};
            toggles[rulePath] = enabled;
            controller.stateManager.setWorkspaceState("localCursorRulesToggles", toggles);
        }
        else if (ruleType === "windsurf") {
            setLocalWindsurfRulesToggles((prev) => ({ ...prev, [rulePath]: enabled }));
            const toggles = controller.stateManager.getWorkspaceStateKey("localWindsurfRulesToggles") || {};
            toggles[rulePath] = enabled;
            controller.stateManager.setWorkspaceState("localWindsurfRulesToggles", toggles);
        }
        else if (ruleType === "agents") {
            setLocalAgentsRulesToggles((prev) => ({ ...prev, [rulePath]: enabled }));
            const toggles = controller.stateManager.getWorkspaceStateKey("localAgentsRulesToggles") || {};
            toggles[rulePath] = enabled;
            controller.stateManager.setWorkspaceState("localAgentsRulesToggles", toggles);
        }
        else {
            // Cline rules
            const result = await toggleClineRule(controller, { metadata: undefined, rulePath, enabled, scope });
            if (result.globalClineRulesToggles?.toggles) {
                setGlobalClineRulesToggles(result.globalClineRulesToggles.toggles);
            }
            if (result.localClineRulesToggles?.toggles) {
                setLocalClineRulesToggles(result.localClineRulesToggles.toggles);
            }
        }
    }, [controller]);
    const handleToggleWorkflow = useCallback(async (isGlobal, workflowPath, enabled) => {
        const { toggleWorkflow } = await import("@/core/controller/file/toggleWorkflow");
        const scope = isGlobal ? RuleScope.GLOBAL : RuleScope.LOCAL;
        // Optimistic update
        if (isGlobal) {
            setGlobalWorkflowToggles((prev) => ({ ...prev, [workflowPath]: enabled }));
        }
        else {
            setLocalWorkflowToggles((prev) => ({ ...prev, [workflowPath]: enabled }));
        }
        await toggleWorkflow(controller, { metadata: undefined, workflowPath, enabled, scope });
    }, [controller]);
    const handleToggleHook = useCallback(async (isGlobal, hookName, enabled, workspaceName) => {
        const { toggleHook } = await import("@/core/controller/file/toggleHook");
        // Optimistic update
        if (isGlobal) {
            setGlobalHooks((prev) => prev.map((h) => (h.name === hookName ? { ...h, enabled } : h)));
        }
        else {
            setWorkspaceHooksState((prev) => prev.map((ws) => ws.workspaceName === workspaceName
                ? { ...ws, hooks: ws.hooks.map((h) => (h.name === hookName ? { ...h, enabled } : h)) }
                : ws));
        }
        const result = await toggleHook(controller, { metadata: undefined, hookName, isGlobal, enabled, workspaceName });
        if (result.hooksToggles) {
            setGlobalHooks(result.hooksToggles.globalHooks || []);
            setWorkspaceHooksState(result.hooksToggles.workspaceHooks || []);
        }
    }, [controller]);
    const handleToggleSkill = useCallback(async (isGlobal, skillPath, enabled) => {
        const { toggleSkill } = await import("@/core/controller/file/toggleSkill");
        // Optimistic update
        if (isGlobal) {
            setGlobalSkills((prev) => prev.map((s) => (s.path === skillPath ? { ...s, enabled } : s)));
        }
        else {
            setLocalSkills((prev) => prev.map((s) => (s.path === skillPath ? { ...s, enabled } : s)));
        }
        await toggleSkill(controller, { metadata: undefined, skillPath, isGlobal, enabled });
    }, [controller]);
    const handleOpenFolder = useCallback(async (folderType, isGlobal) => {
        let folderPath;
        if (isGlobal) {
            // Global folders are in dataDir (e.g., ~/.cline/)
            const subFolder = folderType === "rules" ? "rules" : folderType;
            folderPath = path.join(dataDir, subFolder);
        }
        else {
            // Local folders are in the workspace
            const workspacePaths = await HostProvider.workspace.getWorkspacePaths({});
            const primaryWorkspace = workspacePaths.paths[0];
            if (!primaryWorkspace) {
                return;
            }
            // Local rules/workflows/hooks/skills are in .clinerules or .cline
            const subFolder = folderType === "rules" ? "rules" : folderType;
            folderPath = path.join(primaryWorkspace, ".clinerules", subFolder);
        }
        // Open folder using platform-specific command
        const platform = os.platform();
        let command;
        if (platform === "darwin") {
            command = `open "${folderPath}"`;
        }
        else if (platform === "win32") {
            command = `explorer "${folderPath}"`;
        }
        else {
            command = `xdg-open "${folderPath}"`;
        }
        exec(command, (error) => {
            if (error) {
                // Folder might not exist, try to create and open
                exec(`mkdir -p "${folderPath}" && ${command}`);
            }
        });
    }, [dataDir]);
    // Settings update handlers
    const handleUpdateGlobal = useCallback(async (key, value) => {
        // Update local state for immediate UI feedback
        setGlobalStateLocal((prev) => ({ ...prev, [key]: value }));
        // Persist to state manager
        controller.stateManager.setGlobalState(key, value);
        await controller.stateManager.flushPendingState();
    }, [controller]);
    const handleUpdateWorkspace = useCallback(async (key, value) => {
        // Update local state for immediate UI feedback
        setWorkspaceStateLocal((prev) => ({ ...prev, [key]: value }));
        // Persist to state manager
        controller.stateManager.setWorkspaceState(key, value);
        await controller.stateManager.flushPendingState();
    }, [controller]);
    return (React.createElement(StdinProvider, { isRawModeSupported: isRawModeSupported },
        React.createElement(ConfigView, { dataDir: dataDir, globalClineRulesToggles: globalClineRulesToggles, globalHooks: globalHooks, globalSkills: globalSkills, globalState: globalStateLocal, globalWorkflowToggles: globalWorkflowToggles, hooksEnabled: hooksEnabled, localAgentsRulesToggles: localAgentsRulesToggles, localClineRulesToggles: localClineRulesToggles, localCursorRulesToggles: localCursorRulesToggles, localSkills: localSkills, localWindsurfRulesToggles: localWindsurfRulesToggles, localWorkflowToggles: localWorkflowToggles, onOpenFolder: handleOpenFolder, onToggleHook: handleToggleHook, onToggleRule: handleToggleRule, onToggleSkill: handleToggleSkill, onToggleWorkflow: handleToggleWorkflow, onUpdateGlobal: handleUpdateGlobal, onUpdateWorkspace: handleUpdateWorkspace, skillsEnabled: skillsEnabled, workspaceHooks: workspaceHooksState, workspaceState: workspaceStateLocal })));
};
//# sourceMappingURL=ConfigViewWrapper.js.map