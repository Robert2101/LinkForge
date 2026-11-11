import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// In development the web app runs on :5173 and the API on :5001.
// Proxying /api makes the browser see ONE origin, exactly like production
// (where nginx does the same job), so cookies and CORS behave identically.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: process.env.VITE_API_TARGET ?? "http://localhost:5001" },
    },
  },
  test: {
    environment: "node",
  },
});
