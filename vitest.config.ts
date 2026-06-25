import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [
      "**/node_modules/**",
      "**/dist/**"
    ],
    globals: false,
    hookTimeout: 90_000,
    testTimeout: 90_000
  }
});
