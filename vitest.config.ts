import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  // tsconfig keeps "jsx": "preserve" for Next; component tests need it compiled.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}", "scripts/**/*.test.mjs"],
  },
});
