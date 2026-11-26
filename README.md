# GoRolê

Divide despesas do rolê entre amigos, mostra quem deve a quem e propõe o acerto com o menor número de Pix.

## Stack

- Next.js 16 (App Router), React 19 e TypeScript estrito
- Tailwind CSS v4 e shadcn/ui
- Supabase (Auth e PostgreSQL) com Drizzle ORM e RLS
- Vitest (com PGlite)
- PWA instalável
- Vercel

Decisões, regras de negócio e pendências: [`docs/decisoes.md`](docs/decisoes.md) e [`docs/pendencias.md`](docs/pendencias.md).

## Como rodar

Requisito: Node.js 20.9 ou superior.

```bash
npm install
cp .env.example .env.local
npm run dev
```

A aplicação sobe em [http://localhost:3000](http://localhost:3000).

## Scripts

| Comando              | O que faz                        |
| -------------------- | -------------------------------- |
| `npm run dev`        | Servidor de desenvolvimento      |
| `npm run build`      | Build de produção                |
| `npm run start`      | Sobe o build de produção         |
| `npm run lint`       | ESLint                           |
| `npm test`           | Testes (Vitest)                  |
| `npm run test:watch` | Testes em modo observação        |

## Organização

```
src/
  app/          Rotas, layout, fontes e estilos globais
  components/   Componentes compartilhados (ui/ = shadcn)
  domain/       Regras puras, sem I/O, com teste ao lado
  server/       Acesso a dados e casos de uso (server-only)
  lib/          Utilitários
```

## Fluxo de trabalho

Uma história por branch (`feat/GOR-XX-nome`) e um PR. Commits em português, em uma linha, prefixados com a história.
