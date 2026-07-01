// Test stub for the `server-only` package.
//
// Several server libs start with `import "server-only"`, whose real module
// throws when imported outside a React Server Component (i.e. under Vitest).
// `vitest.config.ts` aliases `server-only` to this empty module so those libs
// import cleanly in a plain Node test environment.
export {};
