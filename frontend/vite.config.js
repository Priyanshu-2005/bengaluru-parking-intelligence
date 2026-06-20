import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Proxy /api to the FastAPI backend so the browser sees a single origin in dev
// (avoids CORS and lets us use relative fetch('/api/...') URLs in the app).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Allow serving local dev under the Mappls-whitelisted hostname (see /etc/hosts trick),
    // so the Mappls Map SDK accepts the Referer locally. Harmless in normal localhost dev.
    allowedHosts: ["bengaluru-parking-intelligence-beryl.vercel.app", "localhost", "127.0.0.1"],
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
});
