import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: { port: 5174 },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/@firebase/") || id.includes("/firebase/"))
            return "firebase";
          if (id.includes("/react-dom/") || id.includes("/react/"))
            return "react";
        },
      },
    },
  },
});
