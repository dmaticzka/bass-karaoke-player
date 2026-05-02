import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    VitePWA({
      // Use our hand-written SW – vite-plugin-pwa injects the precache manifest.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      // Don't auto-inject the registration script; we register manually in
      // main.tsx so we can point at /sw.js (root scope) rather than /static/sw.js.
      injectRegister: null,
      // Don't overwrite the existing public/manifest.json.
      manifest: false,
      injectManifest: {
        // Precache all built assets (JS, CSS, HTML, images).
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff,woff2}"],
        // Prefix all manifest URLs with /static/ so they match the backend's
        // StaticFiles mount point (app.mount("/static", ...)).
        modifyURLPrefix: { "": "/static/" },
        injectionPoint: "self.__WB_MANIFEST",
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  base: "/static/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": "http://localhost:8000",
      "/static": "http://localhost:8000",
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
    typecheck: {
      tsconfig: "./tsconfig.test.json",
    },
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/vite-env.d.ts",
        "src/main.tsx",
        "src/test/**",
        "src/index.css",
      ],
      thresholds: {
        lines: 80,
        branches: 75,
      },
      reporter: ["text", "lcov"],
    },
  },
});
