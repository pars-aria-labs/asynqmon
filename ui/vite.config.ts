import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    {
      name: "asynqmon-server-template",
      transformIndexHtml: {
        order: "post",
        handler(html) {
          const root = command === "build" ? "/[[.RootPath]]" : "";
          return html
            .replaceAll("__ROOT_PATH__", root)
            .replaceAll(
              "__PROMETHEUS_CONFIGURED__",
              command === "build" ? "/[[.PrometheusConfigured]]" : "",
            )
            .replaceAll(
              "__READ_ONLY__",
              command === "build" ? "/[[.ReadOnly]]" : "false",
            )
            .replace(/(src|href)="\.\//g, `$1="${root}/`);
        },
      },
    },
  ],
  // Relative chunk URLs keep lazy imports working for any Go RootPath.
  base: "./",
  build: {
    outDir: "build",
    emptyOutDir: true,
    rollupOptions: {
      output: { manualChunks: { react: ["react", "react-dom", "scheduler"] } },
    },
  },
  server: {
    port: 3000,
    proxy: { "/api": { target: "http://127.0.0.1:8080", changeOrigin: true } },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/setupTests.ts"],
    exclude: ["e2e/**", "node_modules/**"],
    testTimeout: 30000,
  },
}));
