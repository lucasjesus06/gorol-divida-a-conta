import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    // The server entry points to src/server.ts, which wraps SSR errors in a friendly page.
    tanstackStart({ server: { entry: "server" } }),
    viteReact(),
  ],
});
