import { configDefaults, defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default defineConfig(async (env) => {
  const vite = await viteConfig(env);
  return mergeConfig(vite, {
    test: {
      // Esses arquivos usam node:test; são executados pelos runners Node dedicados.
      exclude: [
        ...configDefaults.exclude,
        "tests/ocr-connection.test.ts",
        "tests/ocr-fallback.test.ts",
        "tests/ocr-model.test.ts",
        "tests/ocr-responses.test.ts",
        "tests/stock-photo.test.ts",
      ],
    },
  });
});
