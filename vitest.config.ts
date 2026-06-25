import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    globals: false,
    environment: "node",
    pool: "forks",
    fileParallelism: false,
    maxConcurrency: 1,
    maxWorkers: 1,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      reportsDirectory: "coverage"
    }
  }
});
