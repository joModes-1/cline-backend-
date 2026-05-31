import { SystemPromptSection } from "../templates/placeholders";
import { TemplateEngine } from "../templates/TemplateEngine";
const USER_CUSTOM_INSTRUCTIONS_TEMPLATE_TEXT = `USER'S CUSTOM INSTRUCTIONS

The following additional instructions are provided by the user, and should be followed to the best of your ability without interfering with the TOOL USE guidelines.

{{CUSTOM_INSTRUCTIONS}}`;
export async function getUserInstructions(variant, context) {
    const customInstructions = buildUserInstructions(context.globalClineRulesFileInstructions, context.localClineRulesFileInstructions, context.localCursorRulesFileInstructions, context.localCursorRulesDirInstructions, context.localWindsurfRulesFileInstructions, context.localAgentsRulesFileInstructions, context.clineIgnoreInstructions, context.preferredLanguageInstructions);
    if (!customInstructions) {
        return undefined;
    }
    const template = variant.componentOverrides?.[SystemPromptSection.USER_INSTRUCTIONS]?.template || USER_CUSTOM_INSTRUCTIONS_TEMPLATE_TEXT;
    return new TemplateEngine().resolve(template, context, {
        CUSTOM_INSTRUCTIONS: customInstructions,
    });
}
function buildUserInstructions(globalClineRulesFileInstructions, localClineRulesFileInstructions, localCursorRulesFileInstructions, localCursorRulesDirInstructions, localWindsurfRulesFileInstructions, localAgentsRulesFileInstructions, clineIgnoreInstructions, preferredLanguageInstructions) {
    const customInstructions = [];
    if (preferredLanguageInstructions) {
        customInstructions.push(preferredLanguageInstructions);
    }
    if (globalClineRulesFileInstructions) {
        customInstructions.push(globalClineRulesFileInstructions);
    }
    if (localClineRulesFileInstructions) {
        customInstructions.push(localClineRulesFileInstructions);
    }
    if (localCursorRulesFileInstructions) {
        customInstructions.push(localCursorRulesFileInstructions);
    }
    if (localCursorRulesDirInstructions) {
        customInstructions.push(localCursorRulesDirInstructions);
    }
    if (localWindsurfRulesFileInstructions) {
        customInstructions.push(localWindsurfRulesFileInstructions);
    }
    if (localAgentsRulesFileInstructions) {
        customInstructions.push(localAgentsRulesFileInstructions);
    }
    if (clineIgnoreInstructions) {
        customInstructions.push(clineIgnoreInstructions);
    }
    if (customInstructions.length === 0) {
        return undefined;
    }
    return customInstructions.join("\n\n");
}
//# sourceMappingURL=user_instructions.js.map