import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Split heavy vendor libraries into their own long-cached chunks so the
    // initial JS payload stays small (AL10 mobile slow-load fix). Route pages,
    // the 10 AI features and the 3D viewers are additionally lazy-loaded via
    // dynamic import() in the app code, so they never sit in the entry bundle.
    rollupOptions: {
      output: {
        // Don't hoist the transitive imports of dynamically-loaded chunks into
        // the entry as static imports. Without this, Rollup pulls the big 3D
        // vendor chunks (three / model-viewer) into index.html's modulepreload
        // set even though they're only reached via dynamic import() — defeating
        // the lazy-loading and re-bloating the initial payload.
        hoistTransitiveImports: false,
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          // WebGL / 3D — the single biggest deps. Isolated in their own chunks
          // and reached ONLY via dynamic import() (HeroMesh + ProductModelViewer),
          // so they download on demand, never on initial load.
          if (id.includes("@google/model-viewer")) return "vendor-model-viewer";
          if (id.includes("/three/") || id.includes("three-mesh-bvh")) return "vendor-three";
          // Charts (recharts + d3 deps) — only used by dashboard/chart surfaces.
          if (id.includes("recharts") || id.includes("/d3-") || id.includes("victory-vendor"))
            return "vendor-charts";
          // Core React runtime + router — shared by every route.
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/react-router") ||
            id.includes("/scheduler/")
          )
            return "vendor-react";
          // Radix UI primitives — large but broadly shared across shadcn components.
          if (id.includes("@radix-ui")) return "vendor-radix";
          // Data + forms layer.
          if (
            id.includes("@tanstack") ||
            id.includes("react-hook-form") ||
            id.includes("@hookform") ||
            id.includes("/zod/")
          )
            return "vendor-data";
          // Everything else third-party: return undefined so Rollup's automatic
          // splitting decides. This is important — a catch-all "vendor" chunk
          // would lump dynamic-only deps (e.g. model-viewer's transitive
          // three-dependent packages) together with eager UI libs (lucide, etc.)
          // and drag the heavy 3D code into the initial preload set.
          return undefined;
        },
      },
    },
  },
});
