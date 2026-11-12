// Browser stubs for the Node-only imports at the top of webr.mjs (npm build); never called in the browser.
export function createRequire() { return () => ({}); }
export function fileURLToPath(u) { return String(u); }
export function dirname(p) { return String(p).replace(/\/[^/]*$/, ""); }
export default {};
