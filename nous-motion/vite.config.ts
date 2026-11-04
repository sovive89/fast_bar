import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const src = (p: string) => fileURLToPath(new URL(`./src/${p}`, import.meta.url));

// Modo biblioteca: cada entrada vira um arquivo próprio (tree shaking / import por componente).
// React fica de fora do bundle (peerDependency).
export default defineConfig({
  plugins: [react()],
  // Só para testes/demo: os mesmos nomes de import que um app usaria depois de instalar o pacote.
  resolve: {
    alias: [
      { find: "@nous/motion/loader", replacement: src("loader.ts") },
      { find: "@nous/motion/button", replacement: src("button.ts") },
      { find: "@nous/motion/transition", replacement: src("transition.ts") },
      { find: "@nous/motion/editor", replacement: src("editor.ts") },
      { find: /^@nous\/motion$/, replacement: src("index.ts") },
    ],
  },
  build: {
    lib: {
      entry: {
        index: "src/index.ts",
        loader: "src/loader.ts",
        button: "src/button.ts",
        transition: "src/transition.ts",
        editor: "src/editor.ts",
      },
      formats: ["es"],
      cssFileName: "style",
      fileName: (_format, name) => `${name}.js`,
    },
    rollupOptions: {
      external: ["react", "react-dom", "react/jsx-runtime"],
    },
    cssCodeSplit: false,
    sourcemap: false,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
