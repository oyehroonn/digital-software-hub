import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { wooSyncPlugin } from "./vite-woo-sync.mjs";

// Tauri expects a fixed dev port and no clearing of the terminal.
export default defineConfig(({ mode }) => {
  // Load ALL env vars (incl. server-only WOO_CK/WOO_CS from .env.local) for the
  // dev sync API. Non-VITE_ vars never reach the client bundle.
  const env = loadEnv(mode, process.cwd(), "");
  return {
  // Served at '/' for local dev + the Tauri desktop build; set ADMIN_BASE=/admin/
  // when bundling into the single consolidated Cloudflare Pages deploy.
  base: process.env.ADMIN_BASE || "/",
  plugins: [react(), wooSyncPlugin(env)],
  clearScreen: false,
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    host: "localhost",
  },
  build: {
    target: "es2021",
    outDir: "dist",
  },
  };
});
