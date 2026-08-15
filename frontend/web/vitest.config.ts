import { resolve } from "path";
import { defineConfig } from "vitest/config";

// Kept out of vite.config.ts so the build config stays free of test types. The
// alias has to be repeated here, since Vitest resolves modules itself.
export default defineConfig({
  resolve: {
    alias: {
      "@/": `${resolve(__dirname, "src")}/`,
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
