import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
var __dirname = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
    plugins: [react()],
    build: {
        rollupOptions: {
            input: {
                main: path.resolve(__dirname, "index.html"),
                admin: path.resolve(__dirname, "admin.html")
            }
        }
    },
    /** Standalone `npm run frontend:dev` only — unified dev uses root `npm run dev` on PORT */
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
