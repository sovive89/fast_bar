import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const src = (p: string) => fileURLToPath(new URL(`../../src/${p}`, import.meta.url));

// Em desenvolvimento a demo consome o código-fonte direto, com os mesmos nomes de import
// que um app teria depois de instalar o pacote.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react()],
  resolve: {
    alias: [
      { find: "@nous/motion/loader", replacement: src("loader.ts") },
      { find: "@nous/motion/button", replacement: src("button.ts") },
      { find: "@nous/motion/transition", replacement: src("transition.ts") },
      { find: "@nous/motion/editor", replacement: src("editor.ts") },
      { find: /^@nous\/motion$/, replacement: src("index.ts") },
    ],
  },
});
