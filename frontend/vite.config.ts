import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  /** Pre-bundle TradingView Lightweight Charts so unified `npm run dev` middleware does not 504 on stale dep hashes. */
  optimizeDeps: {
    include: ["lightweight-charts"]
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
        admin: path.resolve(__dirname, "admin.html")
      }
    }
  },
  /**
   * Standalone `npm run frontend:dev` only.
   * Unified `npm run dev` attaches Vite in middleware mode and overrides `port` + HMR to `PORT`.
   */
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:3000",
      "/ws": {
        target: "ws://127.0.0.1:3000",
        ws: true
      }
    }
  }
});
