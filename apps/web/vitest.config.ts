import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules", ".next"],
    // "server-only" throws outside a React Server Component bundle; stub it in tests.
    alias: { "server-only": new URL("./test/server-only-stub.ts", import.meta.url).pathname },
  },
});
