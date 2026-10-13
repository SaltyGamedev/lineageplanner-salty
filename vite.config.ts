import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// `base` is relative so the static build works on GitHub Pages sub-paths.
export default defineConfig({
  base: "./",
  plugins: [react()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
