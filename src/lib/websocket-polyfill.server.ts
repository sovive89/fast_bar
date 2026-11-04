// Garante que o Node do servidor tenha um WebSocket global.
//
// Por quê: o @supabase/supabase-js monta o cliente de realtime já no createClient() e,
// se não acha `globalThis.WebSocket`, lança "Node.js detected but native WebSocket not found".
// O Node só traz WebSocket nativo a partir da versão 22; o runtime de SSR da Amplify roda numa
// versão anterior, então toda server function que cria um cliente Supabase quebrava — foi o
// que travou o login do caixa em "Verificando…".
//
// Com o pacote `ws` como substituto, o erro some em qualquer versão do Node. Em Node 22+ isto
// não faz nada (o WebSocket nativo já existe).
import { WebSocket as WsWebSocket } from "ws";

//
// É uma função chamada explicitamente (e não um import "solto" com efeito colateral) porque o
// package.json declara "sideEffects": false — com isso o bundler descartaria um import vazio.
export function installWebSocketPolyfill(): void {
  if (typeof globalThis.WebSocket === "undefined") {
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = WsWebSocket;
  }
}
