import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  base: "./",
  resolve: {
    alias: {
      "@dcas/core": path.resolve(
        __dirname,
        "../../packages/core/src/index.ts",
      ),
      "@dcas/legal": path.resolve(
        __dirname,
        "../../packages/domains/legal/src/index.ts",
      ),
      // Polyfill node:crypto with a browser shim that uses Web Crypto API
      "node:crypto": path.resolve(__dirname, "src/shims/crypto.ts"),
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom", "recharts"],
  },
});
