# Phone-to-Name Autocomplete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use the approved direct/native execution method for this plan. Steps use checkbox syntax for tracking.

**Goal:** Ao digitar um celular já cadastrado no formulário de abertura manual de comanda, preencher o nome do cliente sem impedir edição manual.

**Architecture:** Adicionar uma consulta de nome por telefone no servidor, protegida pelo gate do caixa e filtrada pelo tenant, que retorna somente o campo `name`. No formulário existente, consultar após debounce quando o celular estiver completo, ignorar resultados antigos e não sobrescrever nomes editados manualmente; manter intacta a busca por CPF/RG.

**Tech Stack:** TypeScript, React, TanStack Start server functions, Supabase, Vitest.

**Spec:** Solicitação do usuário de 04/11/2026; fluxo atual em `src/routes/caixa.index.tsx`.

## Global Constraints

- Reutilizar `sanitizePhone`, `formatPhone`, `assertRegisterAccess` e o padrão de server functions do projeto.
- Só consultar telefones válidos com 10 ou 11 dígitos; validar novamente no servidor.
- Escopar a consulta por `tenant_id`; retornar somente nome ou `null`, nunca telefone, documento ou histórico.
- Nunca sobrescrever texto de nome que a equipe alterou manualmente.
- Não bloquear a abertura manual se a busca falhar; permitir digitação normal.
- Não adicionar dependências, não consultar dados reais de clientes e não alterar a migration/schema.

## Review Focus

- Telefone incompleto ou inválido não deve gerar consulta.
- Resposta atrasada de um telefone anterior não pode preencher o nome do telefone atual.
- Nome digitado/alterado pela equipe não pode ser sobrescrito por resposta assíncrona.
- Trocar telefone não pode deixar nome antigo que tenha sido preenchido automaticamente.
- A consulta deve falhar fechada fora do gate e não pode retornar dados de outro tenant.

---

### Task 1: Consulta privada do nome pelo telefone

**Files:**

- Modify: `src/lib/fastbar.server.ts`
- Modify: `src/lib/register.functions.ts`
- Test: `tests/customer-phone-lookup.test.ts`

**Interfaces:**

- Produces: `lookupCustomerByPhone({ data: { phone: string } }) -> { name: string | null }` para a UI autorizada.
- Produces: helper server-side que consulta apenas `fastbar_customers.name`, filtrando pelo telefone sanitizado e pelo tenant padrão.

- [x] Escrever testes com fixtures sintéticas para correspondência, telefone inválido/incompleto, ausência de resultado, escopo por tenant, gate e retorno apenas de `name`.
- [x] Executar `pnpm exec vitest run tests/customer-phone-lookup.test.ts` e confirmar a falha antes da implementação (`lookupCustomerNameByPhone is not a function`).
- [x] Implementar o helper e a server function, chamando `assertRegisterAccess()` antes da consulta e validando com `sanitizePhone()` no servidor.
- [x] Reexecutar o teste dedicado e confirmar os cinco casos aprovados.

### Task 2: Preenchimento assíncrono no formulário de abertura

**Files:**

- Create: `src/lib/customer-name-draft.ts`
- Modify: `src/routes/caixa.index.tsx`
- Test: `tests/customer-phone-autocomplete.test.ts`

**Interfaces:**

- Consumes: `lookupCustomerByPhone` da Task 1.
- Behavior: debounce de 350 ms após 10/11 dígitos válidos; preencher nome apenas se não houve edição manual; limpar um nome de origem automática obsoleto ao mudar o telefone; expor mensagem de status acessível quando encontrar cliente.

- [x] Escrever testes para elegibilidade do telefone, aplicação do nome encontrado, preservação do nome editado, limpeza da sugestão antiga, precedência CPF/RG e descarte de token assíncrono obsoleto.
- [x] Executar o teste dedicado e confirmar falha antes da implementação do helper/UI.
- [x] Implementar consulta com debounce, invalidação/cancelamento de respostas obsoletas, status `role="status"`/`aria-live="polite"` e compatibilidade com CPF/RG.
- [x] Executar os testes relacionados a registro e os novos testes: 19/19 aprovados.
- [x] Rodar `pnpm exec tsc --noEmit`, ESLint (com a regra Prettier desativada para preservar formatação original não relacionada), build e `git diff --check`.
- [x] Revisar o diff final para assegurar que o autocomplete não envia comanda e que o nome manual não é sobrescrito.

## Resultado das verificações

Os testes focados passaram (4 arquivos, 19 testes); TypeScript, ESLint sem a regra de formatação sobre trechos preexistentes, Prettier dos novos helpers/testes, build e `git diff --check` passaram. A suíte completa `pnpm test` continua retornando código 1 porque o Vitest descobre cinco arquivos Node.js (`ocr-connection`, `ocr-fallback`, `ocr-model`, `ocr-responses` e `stock-photo`) sem suites Vitest; os outros 22 arquivos executaram 184 testes aprovados. O build também preserva o aviso preexistente de glob PWA sem arquivos correspondentes.
