/**
 * Organization picker component for switching between personal account and organizations
 */
import React, { useMemo } from "react";
import { SelectList } from "./SelectList";
/**
 * Get the primary role for display (prioritize owner > admin > member)
 */
function getPrimaryRole(roles) {
    if (roles.includes("owner"))
        return "Owner";
    if (roles.includes("admin"))
        return "Admin";
    if (roles.includes("member"))
        return "Member";
    return roles[0] || "";
}
export const OrganizationPicker = ({ organizations, onSelect, isActive = true }) => {
    const items = useMemo(() => {
        const result = [
            {
                id: "personal",
                label: "Personal",
            },
        ];
        for (const org of organizations) {
            const role = getPrimaryRole(org.roles);
            result.push({
                id: org.organizationId,
                label: org.name,
                suffix: role ? `(${role})` : undefined,
            });
        }
        return result;
    }, [organizations]);
    return React.createElement(SelectList, { isActive: isActive, items: items, onSelect: (item) => onSelect(item.id === "personal" ? null : item.id) });
};
//# sourceMappingURL=OrganizationPicker.js.map