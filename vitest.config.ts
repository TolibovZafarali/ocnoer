import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "*.test.ts",
      "{app,apps,components,lib,packages,scripts}/**/*.{test,spec}.{ts,tsx,js,mjs}"
    ]
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, ".")
    }
  }
});
