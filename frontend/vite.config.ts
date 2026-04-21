import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  server: {
    port: 5173,
    // Use /api/* prefix for backend calls; frontend SPA routes (e.g., /strategy/42)
    // must NOT be proxied. See src/api/client.ts → axios.baseURL='/api'.
    proxy: {
      "/api": { target: "http://localhost:8000", rewrite: (p) => p.replace(/^\/api/, "") },
    },
  },
});
