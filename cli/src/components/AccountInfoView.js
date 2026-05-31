/**
 * Account info view component
 * Shows current provider, and for Cline provider: credit balance and organization name
 */
import { Box, Text } from "ink";
import React, { useCallback, useEffect, useState } from "react";
import { StateManager } from "@/core/storage/StateManager";
import { ClineAccountService } from "@/services/account/ClineAccountService";
import { AuthService } from "@/services/auth/AuthService";
import { LoadingSpinner } from "./Spinner";
/**
 * Capitalize provider name for display
 */
function capitalize(str) {
    return str
        .split("-")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}
/**
 * Format balance as currency (balance is in microcredits, divide by 10000)
 */
function formatBalance(balance) {
    if (balance === null || balance === undefined) {
        return "...";
    }
    return `$${(balance / 1000000).toFixed(2)}`;
}
export const AccountInfoView = React.memo(({ controller }) => {
    const [provider, setProvider] = useState(null);
    const [balance, setBalance] = useState(null);
    const [organization, setOrganization] = useState(null);
    const [email, setEmail] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const fetchAccountInfo = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);
            // Get current provider from state
            const stateManager = StateManager.get();
            const mode = stateManager.getGlobalSettingsKey("mode");
            const providerKey = mode === "act" ? "actModeApiProvider" : "planModeApiProvider";
            const currentProvider = stateManager.getGlobalSettingsKey(providerKey);
            setProvider(currentProvider || "cline");
            // If using Cline provider, fetch additional info
            if (currentProvider === "cline") {
                const authService = AuthService.getInstance(controller);
                // Wait for auth to be restored - poll until we have auth info or timeout
                let authInfo = authService.getInfo();
                let attempts = 0;
                const maxAttempts = 20; // 2 seconds max
                while (!authInfo?.user?.uid && attempts < maxAttempts) {
                    await new Promise((resolve) => setTimeout(resolve, 100));
                    authInfo = authService.getInfo();
                    attempts++;
                }
                // Get user info
                if (authInfo?.user?.email) {
                    setEmail(authInfo.user.email);
                }
                else {
                    // User not logged in to Cline
                    setEmail(null);
                    setIsLoading(false);
                    return;
                }
                // Get organization info
                const organizations = authService.getUserOrganizations();
                if (organizations) {
                    const activeOrg = organizations.find((org) => org.active);
                    if (activeOrg) {
                        setOrganization(activeOrg);
                    }
                }
                // Fetch credit balance
                try {
                    const accountService = ClineAccountService.getInstance();
                    const activeOrgId = authService.getActiveOrganizationId();
                    if (activeOrgId) {
                        // Fetch organization balance
                        const orgBalance = await accountService.fetchOrganizationCreditsRPC(activeOrgId);
                        if (orgBalance?.balance !== undefined) {
                            setBalance(orgBalance.balance);
                        }
                    }
                    else {
                        // Fetch personal balance
                        const balanceData = await accountService.fetchBalanceRPC();
                        if (balanceData?.balance !== undefined) {
                            setBalance(balanceData.balance);
                        }
                    }
                }
                catch {
                    // Balance fetch failed, but we can still show other info
                    // Don't log to console as it pollutes CLI output
                }
            }
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load account info");
        }
        finally {
            setIsLoading(false);
        }
    }, [controller]);
    useEffect(() => {
        fetchAccountInfo();
    }, [fetchAccountInfo]);
    if (isLoading) {
        return (React.createElement(Box, null,
            React.createElement(LoadingSpinner, null),
            React.createElement(Text, { color: "gray" }, " Loading account info...")));
    }
    if (error) {
        return (React.createElement(Box, null,
            React.createElement(Text, { color: "red" },
                "Error: ",
                error)));
    }
    // If not using Cline provider, just show the provider name
    if (provider !== "cline") {
        return (React.createElement(Box, null,
            React.createElement(Text, { color: "gray" }, "Provider: "),
            React.createElement(Text, { color: "cyan" }, capitalize(provider || "Not configured"))));
    }
    // Cline provider but not logged in
    if (!email) {
        return (React.createElement(Box, null,
            React.createElement(Text, { color: "gray" }, "Provider: "),
            React.createElement(Text, { color: "cyan" }, "Cline"),
            React.createElement(Text, { color: "gray" }, " \u2022 "),
            React.createElement(Text, { color: "yellow" }, "Not logged in (run 'cline auth' to sign in)")));
    }
    // Cline provider - show full account info
    return (React.createElement(Box, { flexDirection: "column" },
        React.createElement(Box, null,
            React.createElement(Text, { color: "gray" }, "Provider: "),
            React.createElement(Text, { color: "cyan" }, "Cline"),
            email && (React.createElement(Box, null,
                React.createElement(Text, { color: "gray" }, " \u2022 "),
                React.createElement(Text, { color: "white" }, email)))),
        React.createElement(Box, null,
            organization ? (React.createElement(Box, null,
                React.createElement(Text, { color: "gray" }, "Organization: "),
                React.createElement(Text, { color: "magenta" }, organization.name))) : (React.createElement(Box, null,
                React.createElement(Text, { color: "gray" }, "Account: "),
                React.createElement(Text, { color: "white" }, "Personal"))),
            React.createElement(Text, { color: "gray" }, " \u2022 Credits: "),
            React.createElement(Text, { color: "green" }, formatBalance(balance)))));
});
//# sourceMappingURL=AccountInfoView.js.map