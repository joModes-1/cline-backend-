/**
 * Cline Library Exports
 *
 * This file exports the public API for programmatic use of Cline.
 * Use these classes and types to embed Cline into your applications.
 *
 * @example
 * ```typescript
 * import { ClineAgent } from "cline"
 *
 * const agent = new ClineAgent()
 * await agent.initialize({ clientCapabilities: {} })
 * const session = await agent.newSession({ cwd: process.cwd() })
 * ```
 * @module cline
 */
export { ClineAgent } from "./agent/ClineAgent.js";
export { ClineSessionEmitter } from "./agent/ClineSessionEmitter.js";
//# sourceMappingURL=exports.js.map