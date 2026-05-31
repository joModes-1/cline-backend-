/**
 * Internal types for ACP integration with Cline CLI.
 *
 * This file re-exports all public types from ./public-types.ts and adds
 * internal-only Types that reference core modules (Controller, etc.).
 *
 * Library consumers should never import from this file directly — they
 * get the public types via the library entrypoint (exports.ts).
 */
export { AcpSessionStatus } from "./public-types.js";
//# sourceMappingURL=types.js.map