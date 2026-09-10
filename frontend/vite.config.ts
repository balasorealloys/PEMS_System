import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Dev server proxies /api to the FastAPI backend so the app can call it same-origin.
// Target 127.0.0.1, not localhost: on Windows, "localhost" often resolves to the
// IPv6 loopback (::1) first, and since uvicorn only binds IPv4 (0.0.0.0), every
// proxied request pays a ~2s stall before falling back to IPv4.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: { include: ["react", "react-dom", "react/jsx-runtime"] },
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      "/api": { target: "http://127.0.0.1:4040", changeOrigin: true },
    },
  },
});
