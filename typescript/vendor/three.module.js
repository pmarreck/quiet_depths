// Node runs the TypeScript sources in place, so this path must reach the
// vendored Three module. Browsers load vendor/three.module.js itself, beside
// the compiled modules, and never load this file.
export * from '../../vendor/three.module.js';
