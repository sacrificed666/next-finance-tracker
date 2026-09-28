import { defineConfig } from "vitest/config";

// Unit tests for the pure parts of the app: money maths, taxes, parsing, state changes.
// They run in Node, next to the code they test (`*.test.ts`), and never touch a database.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
