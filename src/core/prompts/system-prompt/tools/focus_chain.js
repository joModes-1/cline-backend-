import { ModelFamily } from "@/shared/prompts";
import { ClineDefaultTool } from "@/shared/tools";
// HACK: Placeholder to act as tool dependency
const generic = {
    variant: ModelFamily.GENERIC,
    id: ClineDefaultTool.TODO,
    name: "focus_chain",
    description: "",
    contextRequirements: (context) => context.focusChainSettings?.enabled === true,
};
export const focus_chain_variants = [generic];
//# sourceMappingURL=focus_chain.js.map