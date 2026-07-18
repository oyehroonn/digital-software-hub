import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Tauri expects a fixed dev port and no clearing of the terminal.
export default defineConfig({
  // Served at '/' for local dev + the Tauri desktop build; set ADMIN_BASE=/admin/
  // when bundling into the single consolidated Cloudflare Pages deploy.
  base: process.env.ADMIN_BASE || "/",
  plugins: [react()],
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
});
