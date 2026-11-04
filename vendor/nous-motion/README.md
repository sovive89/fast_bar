# @nous/motion 0.1.0 no FastBar

Pacote original de `https://github.com/sovive89/-Nous_motion`, commit
`28d145f6c71e1b386ccc471813c907ceb24968f5`. Nenhuma alteração no código da
biblioteca. O pacote ainda é privado e não foi publicado em registro; o FastBar
instala o artefato local versionado para que o deploy não dependa de `dist/`
existir no GitHub nem de compilar outro repositório durante a instalação.

- Artefato: `nous-motion-0.1.0-28d145f.tgz` (17,7 kB).
- SHA-256: `0aa7103d82cc1d240d8b3f2fa4d5cecd4af80ae124afa98b5c31c6391a048deb`.
- Construído com Node 24.22.1, pnpm 11.25.0, Vite 6.4.5 e TypeScript 5.9.3.
- Validação: typecheck, 67 testes, build e medição de tamanho passaram.
- Entrada de botão: 2,63 kB gzip de JS; CSS compartilhado: 2,47 kB gzip.

O lock de ferramentas original continha versões lançadas no mesmo dia e foi
recusado pela política de idade mínima do ambiente. `build-lock.yaml` fixa uma
resolução nova das mesmas faixas do `package.json` original, aceita por essa
política. Não foi necessário alterar o código da biblioteca nem enfraquecer a
política. O lock principal do FastBar fixa o checksum do tarball. `bun.lock` não
foi regenerado; para esta integração, usar `pnpm install --frozen-lockfile`.

Para reproduzir o artefato, na raiz do FastBar:

```sh
bash vendor/nous-motion/rebuild.sh
```

O script clona o commit em uma pasta temporária, instala somente as ferramentas
fixadas, executa as verificações e gera outro tarball nessa pasta. Mostra o
checksum para comparação, sem substituir automaticamente o arquivo versionado.
Os scripts de instalação das dependências ficam desabilitados; o esbuild usa o
binário opcional já distribuído no seu pacote de plataforma.

Uso no aplicativo:

```tsx
import { NousButton } from "@nous/motion/button";
import "@nous/motion/style.css";

<NousButton
  template="pulse"
  variant="outline"
  speed={0.45}
  intensity={0.2}
  reducedMotion="system"
>
  Apoio
</NousButton>
```

Apenas esta entrada é importada na interface de apoio. A camada de animação
existente do FastBar continua independente. O template `pulse` faz um halo
suave; `alert` sacode horizontalmente e não é o efeito de respiro solicitado.
