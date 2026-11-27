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

## Autenticação

O login da conta é por **código de 6 dígitos enviado por e-mail**, sem senha, pelo Supabase Auth. Não há cadastro público: só entra quem já tem conta aprovada. O convidado de um rolê usa uma sessão anônima, que só vira uma pessoa depois de conferido o telefone.

Configuração do projeto Supabase (use um projeto de **desenvolvimento**, separado do de produção):

1. Em **Project Settings → API Keys**, copie a chave **publishable** e a URL do projeto para `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` e `NEXT_PUBLIC_SUPABASE_URL` no `.env.local`.
2. Em **Authentication → Sign In / Providers**, desative **Allow new users to sign up**, deixe **Email** habilitado e habilite **Allow anonymous sign-ins**.
3. Em **Authentication → Email Templates → Magic Link**, troque o link por `{{ .Token }}`, para o e-mail trazer o código.
4. Em **Authentication → SMTP Settings**, configure um remetente próprio: o remetente padrão tem limite baixo de envios e só entrega a membros da equipe do projeto.
5. Em **Authentication → Users → Add user**, crie a conta com **Auto Confirm User** marcado (a aprovação por painel vem na história GOR-19).
6. Entre em `/login` com esse e-mail, informe o código e preencha nome e telefone.

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
