# PWA Cliente: Recuperação de Rede e Fallback de Marca — Plano de Implementação

> **Para execução agentic:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans. Execute os passos em ordem e verifique cada entrega.

**Objetivo:** Corrigir os estados presos e falhas silenciosas da PWA cliente, preservar o fallback visual e entregar um arquivo `.patch` completo com as mudanças.

**Arquitetura:** O provider de branding inicia com `DEFAULT_BRANDING`, mantém a última marca válida em falhas, encerra o loading com timeout e permite retry manual/ao reconectar. O apoio depende da preferência local e da comanda, não do carregamento da marca. O cardápio mantém dados anteriores durante falhas de polling e expõe erro, vazio e retry; pedido de conta sempre libera o botão em `finally`; o rodapé só conta o slot de apoio quando já tem outro conteúdo, usando o fallback flutuante existente quando não há rodapé.

**Stack:** React 19, TanStack Start, TypeScript, Vitest, ESLint, Vite/Nitro.

**Especificação:** Pedido do usuário de gerar um diff completo com as correções de rede/fallback anteriormente acordadas aplicadas ao checkout `/home/ubuntu/review/fast_bar`.

## Restrições globais

- Não adicionar dependências.
- Não alterar autenticação, RPCs, banco, retenção ou migration.
- Preservar o comportamento de consentimento/localStorage e os gates de sessão existentes.
- Não descartar a última marca ou o último cardápio válidos por erro de rede.
- Não criar uma barra de rodapé vazia; preservar o portal flutuante de apoio como fallback.
- Gerar o patch a partir do diff do checkout, sem incluir mudanças preexistentes nem o próprio arquivo `.patch`.
- Não criar commit nem publicar mudanças.

## Foco de revisão

- Branding falha no primeiro carregamento, expira ou falha após uma leitura válida: fallback seguro, sem loading eterno.
- Navegador volta online: nova tentativa sem loop de chamadas.
- Cardápio falha na primeira leitura, falha após sucesso, retorna vazio e recebe retry manual.
- Comanda aberta sem preferência de apoio, com apoio ativado e sem branding carregado: consentimento e visibilidade corretos.
- `onRequestBill` rejeita, retorna erro de negócio ou sucesso: mensagem correta e botão reutilizável.
- Não há contatos/redes nem apoio ativo: rodapé oculto e botão de apoio ainda usa o portal `document.body`.

---

### Tarefa 1: Fallback de branding e disponibilidade do apoio

**Arquivos:**

- Modificar `src/lib/branding/BrandingProvider.tsx`.
- Modificar `src/features/client/components/SupportWidget.tsx`.
- Testes: adicionar testes unitários sem dependência de DOM para a função pura de timeout/fallback, se a implementação a extrair; caso contrário, cobrir com typecheck/build e registrar a ausência de harness de componentes.

**Interfaces:**

- `useBranding()` continua oferecendo `branding`, `isLoading` e `style`; acrescenta `brandingError` e `retryBranding()`.
- O fallback inicial permanece `DEFAULT_BRANDING`; falhas de atualização preservam a última marca válida.

- [ ] Implementar encerramento garantido de loading, timeout, retry explícito e retry ao evento `online`, cancelando atualizações após unmount.
- [ ] Remover `isLoading` da condição de renderização de `SupportWidget`; conservar `ready`, `activeSession`, preferência e demais gates.
- [ ] Executar testes focados, TypeScript e ESLint dos arquivos alterados.

### Tarefa 2: Estado de falha, retry e catálogo vazio

**Arquivos:**

- Modificar `src/features/client/components/MenuList.tsx`.

**Interfaces:**

- Manter a assinatura atual de `MenuList`.
- A UI distingue carregamento inicial, falha sem dados, erro de atualização com dados anteriores e catálogo carregado vazio.

- [ ] Adicionar retry manual e estado acessível (`role="status"`/`role="alert"` conforme o caso); impedir polling concorrente.
- [ ] Preservar os itens válidos em falhas de atualização periódica.
- [ ] Executar testes existentes, TypeScript e ESLint do arquivo.

### Tarefa 3: Recuperação do pedido de conta

**Arquivos:**

- Modificar `src/features/client/components/CustomerTabView.tsx`.

**Interfaces:**

- Manter a assinatura pública de `CustomerTabViewProps` e de `onRequestBill`.

- [ ] Envolver a chamada em `try/catch/finally`, apresentar erro de rede e liberar `requesting` em todos os caminhos.
- [ ] Anunciar a falha com `role="alert"` sem depender só de cor.
- [ ] Executar TypeScript, lint e testes focados do fluxo de pedido de conta.

### Tarefa 4: Rodapé sem conteúdo vazio

**Arquivos:**

- Modificar `src/features/client/components/CompanyFooter.tsx`.

**Interfaces:**

- Preservar a prop `supportSlotRef` e o mecanismo de portal.

- [ ] Definir a visibilidade do rodapé somente por dados/links públicos; não contar uma ref vazia como conteúdo.
- [ ] Confirmar que, sem rodapé, o `SupportWidget` continua usando o fallback `document.body`.
- [ ] Executar TypeScript e lint.

### Tarefa 5: Diff e verificação final

**Arquivos de saída:**

- Criar `/home/ubuntu/review/fast_bar-client-pwa-fixes.patch`, fora da árvore Git.

- [ ] Confirmar que o checkout começou limpo e que não há mudanças alheias no diff.
- [ ] Executar `pnpm exec vitest run` nos testes relevantes, `pnpm exec tsc --noEmit`, ESLint nos arquivos modificados e `pnpm build`.
- [ ] Gerar o patch com `git diff --binary HEAD`; verificar cabeçalho, arquivos incluídos e que o patch aplica com `git apply --check` em uma cópia temporária/índice alternativo.
- [ ] Relatar comandos, resultados, limitações e entregar o link do `.patch`.
