import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  server: { port: 4033, strictPort: true },
  preview: { port: 4033, strictPort: true },
  build: {
    emptyOutDir: true,
    rollupOptions: {
      input: "index.html"
    }
  }
});
