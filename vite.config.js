import { defineConfig } from "vite";

// Cookies are forwarded by the same-origin proxy; no shared API token is injected.
export default defineConfig({
  server: {
    host: "0.0.0.0",
    proxy: { "/api": { target: process.env.PAROLA_API_URL ?? "http://127.0.0.1:8000", changeOrigin: false } },
  },
});
