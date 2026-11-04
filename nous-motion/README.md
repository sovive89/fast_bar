# @nous/motion

Animações e microinterações modulares para React. Independente de qualquer app: **sem Supabase, sem
autenticação, sem backend**. Estado: `0.1.0`, pacote privado (ainda não publicado).

## Instalar (enquanto não está publicado)

```bash
cd nous-motion && pnpm install && pnpm build
# no app consumidor (ex.: um pacote local):
pnpm add ../nous-motion
```

React e React DOM (>=18) são `peerDependencies`.

## Usar

```tsx
import "@nous/motion/style.css";            // uma vez, no app
import { NousLoader } from "@nous/motion/loader";

<NousLoader template="orbit" primaryColor="#FF6B00" size={48} speed={1.2} state="loading" />
```

| Import | Conteúdo |
|---|---|
| `@nous/motion/loader` | `NousLoader` (orbit, pulse, dots, wave, progress, logo) |
| `@nous/motion/button` | `NousButton` (pulse, ripple, glow, magnetic, scale, slide, success, loading, notification, alert) |
| `@nous/motion/transition` | `NousTransition` (fade, slide, scale, collapse) |
| `@nous/motion/editor` | `MotionEditor`, `MotionGallery`, `MotionCustomizer`, `MotionPreview` — **não** vem no núcleo |
| `@nous/motion` | núcleo: tipos, presets, validação, hooks, os três componentes |

Carregue o editor sob demanda: `lazy(() => import("@nous/motion/editor"))`.

## Regras de design

- **Progresso é real.** `state="progress"` só mostra o valor de `progress` que você passar. Sem valor,
  a barra fica *indeterminada*; nada é simulado.
- **Acessibilidade.** `prefers-reduced-motion` desliga efeitos decorativos (`reducedMotion="system|always|never"`).
  Rótulo, ícone (✓/✕) e valor continuam. Sucesso/erro nunca dependem só de cor.
- **Botão** é um `<button>` nativo (teclado, foco visível, `aria-busy` em loading). Em `loading` fica inerte
  mas mantém o foco. Efeitos de hover só rodam com mouse (`hover: hover` + `pointer: fine`).
- **Desempenho.** Animações em CSS com `transform`/`opacity`. Exceção documentada: `collapse` anima altura.
  Nenhuma chamada de rede durante animações.

## Presets (JSON, sem código)

```json
{ "id": "meu-loader", "component": "loader", "template": "orbit", "version": 1,
  "parameters": { "primaryColor": "#FF6B00", "size": 48 } }
```

`validatePreset` / `parsePresetJson` rejeitam parâmetros desconhecidos, cores/URLs fora da lista segura
(`javascript:`, `url()`, `http:`), números fora de faixa e versões diferentes de 1. O resultado é um objeto
novo, reconstruído só com campos conhecidos. `useMotionPreset(preset)` valida antes de aplicar.

## Persistência e multitenancy

`MotionStorageAdapter` (`list/get/save/remove`) é só uma interface; `createMemoryAdapter()` serve para testes.
A biblioteca **não** conhece tenant nem autenticação: o app consumidor implementa o adaptador (ex.: Supabase) com
o escopo e a autorização dele, e nunca compartilha configurações entre tenants.

## IA (futuro)

`MotionSuggester` + `acceptSuggestion` definem o ponto de entrada: a IA devolve **dados**, que passam pelo mesmo
validador dos presets. Nenhuma integração com provedor existe nesta versão.

## Desenvolvimento

```bash
pnpm typecheck   # tsc
pnpm test        # vitest + Testing Library (jsdom)
pnpm build       # vite (modo biblioteca) + tipos
pnpm size        # gzip real por entrada
pnpm demo        # app de exemplo em examples/react-demo
```

## Tamanho (medição do build atual, gzip)

Ver a saída de `pnpm size`. O orçamento de 30 KB é uma meta, **não uma garantia**: reavalie a cada mudança.

## Limitações conhecidas

- O CSS é um único `style.css` (inclui o do editor). Separar por componente é uma evolução possível.
- `template="logo"` sem `logo` cai num pulso simples.
- Ainda sem teste visual automatizado (screenshots) e sem testes em iOS/Android reais.
