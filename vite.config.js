import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  // Read GOOGLE_CLIENT_ID from .env files or the hosting environment (e.g. Vercel).
  // Only this one variable is passed to the browser code.
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  const clientId = env.GOOGLE_CLIENT_ID || env.VITE_GOOGLE_CLIENT_ID || "";

  return {
    plugins: [react()],
    define: { __GOOGLE_CLIENT_ID__: JSON.stringify(clientId.trim()) },
    worker: { format: "es" },
    optimizeDeps: { exclude: ["onnxruntime-web"] },
  };
});
