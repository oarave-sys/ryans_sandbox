import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Base is relative so the built app also works when opened from a subpath
// or served as static files inside the clinic network.
export default defineConfig({
  base: "./",
  plugins: [react()],
});
