// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  vite: {
    // Carimbo da build — o MESMO literal no bundle do servidor e no do cliente, porque é
    // substituído em tempo de compilação. É isso que deixa o app perceber sozinho que a aba
    // aberta ficou pra trás: o cliente antigo carrega o carimbo ANTIGO e pergunta ao servidor
    // (que já é o deploy NOVO) qual é o dele; se não baterem, a aba está velha.
    //
    // Sem isso, uma aba do caixa aberta durante um deploy continua rodando o JS de quando foi
    // aberta — foi exatamente assim que o módulo Configurações "sumiu" do celular da equipe
    // mesmo com a produção já correta.
    define: {
      __BUILD_ID__: JSON.stringify(
        process.env["VERCEL_GIT_COMMIT_SHA"] || `dev-${Date.now().toString(36)}`,
      ),
    },
    plugins: [
      VitePWA({
        injectRegister: "auto",
        registerType: "autoUpdate",
        includeAssets: ["favicon.svg", "favicon.ico", "robots.txt"],
        manifest: {
          name: "Pop9Bar",
          short_name: "PØP9 BAR",
          start_url: "/equipe",
          display: "standalone",
          theme_color: "#f97316",
          background_color: "#0a0a0a",
          scope: "/",
          icons: [
            { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            {
              src: "/icons/maskable-icon.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
          // skipWaiting/clientsClaim pra que um service worker novo assuma as abas já abertas na
          // hora, em vez de esperar a próxima navegação.
          //
          // ATENÇÃO: hoje este plugin escreve em `dist/`, e o que a Vercel publica é
          // `.output/public/` — ou seja, NENHUM service worker chega à produção e este bloco está
          // inerte. O manifest que vale é o `public/manifest.webmanifest`, escrito à mão. Por isso
          // a detecção de versão nova é feita no app (ver src/lib/app-version.functions.ts), e não
          // via ciclo de vida do service worker: não dá pra depender de um SW que não existe.
          skipWaiting: true,
          clientsClaim: true,
        },
      }),
    ],
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
