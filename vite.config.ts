import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// Base is relative so the built app also works when opened from a subpath
// or served as static files inside the clinic network.
//
// Set SINGLE_FILE=1 to inline all JS/CSS into one self-contained index.html
// (useful for a zero-install prototype you can open by double-clicking, or
// publish as a shareable page). The normal build keeps split assets.
const singleFile = process.env.SINGLE_FILE === "1";

export default defineConfig({
  base: "./",
  plugins: [react(), ...(singleFile ? [viteSingleFile()] : [])],
  server: {
    // During `npm run dev`, proxy API calls to the backend server.
    proxy: {
      "/api": {
        target: process.env.API_ORIGIN || "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
});
