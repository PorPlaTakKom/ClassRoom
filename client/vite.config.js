import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    https:
      process.env.VITE_SSL_KEY && process.env.VITE_SSL_CERT
        ? {
            key: fs.readFileSync(process.env.VITE_SSL_KEY),
            cert: fs.readFileSync(process.env.VITE_SSL_CERT)
          }
        : false
  }
});
