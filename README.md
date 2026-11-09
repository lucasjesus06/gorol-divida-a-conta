# GoRolê — Divida a conta

Aplicação para dividir custos em ocasiões sociais: registrar despesas compartilhadas, calcular quem deve para quem e facilitar os acertos (inicialmente via Pix).

> Estado atual: protótipo de frontend com dados simulados e armazenamento local no navegador. O backend (Java + PostgreSQL) será construído em um repositório próprio.

## Stack do frontend

- React 19 + TypeScript
- TanStack Router (roteamento por arquivos, app de página única)
- Tailwind CSS 4 + componentes no padrão shadcn/ui
- Motion (animações)
- Vite 8

## Como rodar localmente

Pré-requisito: Node.js 22.12+ (ou [Bun](https://bun.sh) 1.3+).

```sh
npm install
npm run dev
```

A aplicação sobe em `http://localhost:5173` (ou na próxima porta livre, indicada pelo Vite).

## Scripts

| Script              | O que faz                                         |
| ------------------- | ------------------------------------------------- |
| `npm run dev`       | Servidor de desenvolvimento                       |
| `npm run build`     | Build de produção (arquivos estáticos em `dist/`) |
| `npm run preview`   | Serve o build localmente                          |
| `npm run typecheck` | Verificação de tipos (`tsc --noEmit`)             |
| `npm run lint`      | ESLint + Prettier                                 |
| `npm run format`    | Formata o código com Prettier                     |

## Organização do código

```
src/
  routes/          Declaração das rotas (URL, head, params). Apenas delegam para as páginas das features.
  app/             Composição global da aplicação (instância do router).
  components/
    ui/            Primitivos de interface (padrão shadcn/ui).
    layout/        Estrutura de página (Shell, Logo).
    common/        Componentes visuais reutilizáveis (Pill, Avatar, Sparkle).
  lib/             Utilitários globais (cn, formatação).
  features/
    bill/          Domínio da conta: model (tipos, dados simulados), services (persistência e ações),
                   hooks (acesso ao estado) e lib (cálculos). API pública em features/bill/index.ts.
    home/          Tela inicial.
    scan/          Leitura (simulada) da nota fiscal.
    host/          Painel de quem criou o rolê.
    guest/         Visão do convidado (marcar itens consumidos).
    payment/       Pagamento via Pix (simulado).
  main.tsx         Ponto de entrada: monta o app em index.html.
```

Regras de dependência:

- `routes` → `features` → `components` / `lib`.
- Componentes não acessam o armazenamento diretamente: usam os hooks de `features/bill`, que usam os services.
- Uma feature consome outra apenas pela API pública (`@/features/bill`).

Quando o backend existir, apenas a implementação dos services de `features/bill` muda para chamadas HTTP.

## Padrão de branches

| Branch                 | Uso                                        |
| ---------------------- | ------------------------------------------ |
| `main`                 | Versão estável                             |
| `develop`              | Integração das features                    |
| `feature/<descricao>`  | Funcionalidade nova                        |
| `fix/<descricao>`      | Correção de bug                            |
| `refactor/<descricao>` | Reorganização sem mudança de comportamento |
| `chore/<descricao>`    | Manutenção, configuração, dependências     |
| `docs/<descricao>`     | Documentação                               |

Nomes em minúsculas, palavras separadas por hífen.

## Pendências conhecidas

Bugs e inconsistências de domínio mapeados para as próximas etapas estão em [`docs/pendencias.md`](docs/pendencias.md).
