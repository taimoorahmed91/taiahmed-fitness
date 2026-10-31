import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Stable, cache-friendly vendor chunks. Matches whole package directories only (never a
// bare substring), and anything not listed here is left to Rollup's own splitting, so a
// package we do not know about can never be pulled into the wrong chunk.
// PDF/html2canvas are already split by their dynamic imports (ChartPdfButton, Reports)
// and are deliberately NOT forced into a manual chunk: that would risk loading them up front.
const CHART_PACKAGES = ["recharts", "recharts-scale", "react-smooth", "victory-vendor", "decimal.js-light", "internmap"];
// Rollup also drags the *dependencies* of a manual chunk's modules into it. React and clsx are
// among those (recharts needs them), and the app entry needs them too, so unless they have a
// home of their own the whole charts bundle ends up in the initial load. Keep them explicit.
const CORE_PACKAGES = ["react", "react-dom", "scheduler", "react-is", "clsx"];
const inPackage = (id: string, name: string) =>
  id.includes(`/node_modules/${name}/`) || id.includes(`\\node_modules\\${name}\\`);

const manualChunks = (id: string): string | undefined => {
  // Rollup's CommonJS interop helpers (not a node_modules file) are used everywhere.
  if (id.includes("commonjsHelpers")) return "vendor-core";
  if (!id.includes("node_modules")) return undefined;
  if (CORE_PACKAGES.some((name) => inPackage(id, name))) return "vendor-core";
  if (CHART_PACKAGES.some((name) => inPackage(id, name)) || /[/\\]node_modules[/\\]d3-[^/\\]+[/\\]/.test(id)) {
    return "vendor-charts";
  }
  if (inPackage(id, "@supabase")) return "vendor-supabase";
  return undefined;
};

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");

  // Every origin that serves private data. These are routed NetworkOnly in the
  // generated service worker, so they can never be stored in a cache.
  // (Patterns are serialized into sw.js, so they must be plain RegExp literals/values.)
  const supabaseOrigin = env.VITE_SUPABASE_URL ? new URL(env.VITE_SUPABASE_URL).origin : null;
  const neverCache: RegExp[] = [
    /^https:\/\/[^/]+\.supabase\.(co|in|net)\//,
    ...(supabaseOrigin ? [new RegExp("^" + escapeRegExp(supabaseOrigin) + "/")] : []),
  ];

  return {
    server: {
      host: "::",
      port: 8080,
    },
    plugins: [
      react(),
      mode === "development" && componentTagger(),
      VitePWA({
        // PROMPT strategy: a new worker installs and then waits. Nothing skips waiting or
        // reloads by itself; src/pwa/register.ts + usePwaUpdate decide when (never during a workout).
        registerType: "prompt",
        // Registration is done by src/pwa/register.ts (loaded from index.html), not auto-injected.
        injectRegister: false,
        // The manifest is the hand-written public/manifest.webmanifest.
        manifest: false,
        devOptions: { enabled: false },
        workbox: {
          // One self-contained sw.js (easy to audit; nothing extra to fetch while installing).
          inlineWorkboxRuntime: true,
          skipWaiting: false,
          clientsClaim: false,
          cleanupOutdatedCaches: true,
          cacheId: "fittrack",
          // Recovery / kill switch: answers `/?sw=off` itself. See src/pwa/swPolicy.ts.
          importScripts: ["sw-recovery.js"],
          // App shell, icons, manifest, bundled fonts. Nothing else is precached.
          globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest,woff,woff2,ttf}"],
          globIgnores: ["presentation/**", "sw-recovery.js"],
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          // Offline navigations get the SPA shell, except for real files, the static guide and API-looking paths.
          navigateFallback: "/index.html",
          navigateFallbackDenylist: [
            /^\/presentation\//,
            /^\/(api|auth|rest|functions|storage|realtime)\//,
            /^\/~oauth/,
            /\/[^/?]+\.[^/?]+$/,
          ],
          runtimeCaching: [
            // 1) Private data is NEVER cached. These rules come first so no later rule can match.
            ...neverCache.map((urlPattern) => ({ urlPattern, handler: "NetworkOnly" as const })),
            {
              // Anything carrying credentials, whatever the host.
              urlPattern: ({ request }: { request: Request }) =>
                request.headers.has("authorization") || request.headers.has("apikey"),
              handler: "NetworkOnly" as const,
            },
            // 2) Public font files only.
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
              handler: "StaleWhileRevalidate" as const,
              options: {
                cacheName: "fittrack-google-fonts-css-v1",
                expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
              handler: "CacheFirst" as const,
              options: {
                cacheName: "fittrack-google-fonts-files-v1",
                expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
      }),
    ].filter(Boolean),
    build: {
      rollupOptions: {
        output: { manualChunks },
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
