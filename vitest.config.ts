import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Repo root, used to resolve the `@/` path alias to match tsconfig `paths`.
const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // `import "server-only"` throws outside React Server Components. Point it
      // at an empty stub so the server libs under test import cleanly.
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
      // Mirror tsconfig `paths`: `@/*` -> repo root.
      "@": rootDir.replace(/\/$/, ""),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
