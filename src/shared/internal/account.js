/**
 * List of email domains that are considered trusted testers for Cline.
 */
const CLINE_TRUSTED_TESTER_DOMAINS = ["fibilabs.tech"];
/**
 * Checks if the given email belongs to a Cline bot user.
 * E.g. Emails ending with @cline.bot
 */
export function isClineBotUser(email) {
    return email.endsWith("@cline.bot");
}
export function isClineInternalTester(email) {
    return isClineBotUser(email) || CLINE_TRUSTED_TESTER_DOMAINS.some((d) => email.endsWith(`@${d}`));
}
//# sourceMappingURL=account.js.map