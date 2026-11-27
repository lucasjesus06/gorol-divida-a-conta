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

O login da conta é por **código de 6 dígitos enviado por e-mail**, sem senha, pelo Supabase Auth. Não há cadastro público: só entra quem tem conta aprovada, por **pedido de acesso** (`/pedir-acesso`) aprovado no painel `/admin` ou por **convite** (`/convite/<código>`) gerado nele. O convidado de um rolê usa uma sessão anônima, que só vira uma pessoa depois de conferido o telefone.

Configuração do projeto Supabase (use um projeto de **desenvolvimento**, separado do de produção):

1. Em **Project Settings → API Keys**, copie a chave **publishable** e a URL do projeto para `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` e `NEXT_PUBLIC_SUPABASE_URL` no `.env.local`, e a chave **secret** para `SUPABASE_SECRET_KEY`. Essa última só é usada no servidor, para criar a conta quando um pedido é aprovado; nunca a coloque em variável `NEXT_PUBLIC_*`.
2. Em **Authentication → Sign In / Providers**, desative **Allow new users to sign up**, deixe **Email** habilitado e habilite **Allow anonymous sign-ins**.
3. Em **Authentication → Email Templates → Magic Link**, troque o link por `{{ .Token }}`, para o e-mail trazer o código.
4. Em **Authentication → SMTP Settings**, configure um remetente próprio: o remetente padrão tem limite baixo de envios e só entrega a membros da equipe do projeto.
5. Depois de rodar `npm run db:migrate`, marque a sua conta como super administrador no **SQL Editor** (a conta precisa existir; para a primeira, crie-a em **Authentication → Users → Add user** com **Auto Confirm User** marcado):

   ```sql
   insert into super_admins (user_id) select id from auth.users where email = 'seu-email@exemplo.com';
   ```

6. Entre em `/login` com esse e-mail, informe o código e preencha nome e telefone. O painel fica em `/admin`, com o botão "Administração" na tela inicial.

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
