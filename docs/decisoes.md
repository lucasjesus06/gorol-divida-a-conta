# Registro de decisões

Tudo o que já foi decidido sobre o produto, as regras de negócio, a arquitetura e a forma de trabalho. Quando uma decisão mudar, atualize este documento no mesmo PR da mudança.

Documentos relacionados:

- Especificação original do produto: [`produto/especificacao-funcional.md`](produto/especificacao-funcional.md)
- Pendências: [`pendencias.md`](pendencias.md)
- Evoluções futuras: [`evolucoes.md`](evolucoes.md)
- Regras de trabalho do agente: [`../CLAUDE.md`](../CLAUDE.md)

## 1. Repositório e stack

Um único repositório, `lucasjesus06/gorol-divida-a-conta`, na mesma stack e nos mesmos padrões do Kalu (`lucasjesus06/kalu-account-management`), que é a referência quando há dúvida de padrão. O visual (cores, fonte Plus Jakarta Sans, componentes) é o do Gorole.

- **Aplicação:** Next.js 16 (App Router, `cacheComponents` e `partialPrefetching`), React 19, TypeScript estrito, Tailwind CSS v4, shadcn/ui.
- **Dados:** PostgreSQL do Supabase com Drizzle ORM, com isolamento por RLS. O Supabase Auth cuida da sessão.
- **Testes:** Vitest, com PGlite rodando as migrations reais.
- **PWA instalável** (manifest, service worker e notificações push) no lugar do Capacitor/APK.
- **Deploy:** Vercel.
- **Substituídos:** o backend NestJS com MySQL (`gorole-service`) e o app Vite com `localStorage`. O código de domínio do `gorole-service` é a origem de `src/domain`.
- **Autenticação:** sessão do Supabase. Login de conta por código de uso único (sem senha). Entrada no rolê por link único com conferência do telefone (ver "Entrada no rolê").
- Valores em centavos inteiros, datas em UTC, textos em `utf8mb4`/UTF-8.

## 2. Glossário (produto → código)

| Termo do produto                     | Código                         | Observação                                    |
| ------------------------------------ | ------------------------------ | --------------------------------------------- |
| Rolê (relação pontual ou recorrente) | `Outing`                       | Contexto onde as despesas são registradas     |
| Grupo fixo                           | `Group`                        | Reúne relações; membros permanentes têm conta |
| Relação pessoa × pessoa              | visão `pair` (`pairStatement`) | Tudo entre duas pessoas, em todos os rolês    |
| Despesa                              | `Expense`                      | Tem versões; nunca é editada no lugar         |
| Quem pagou a despesa                 | `Payer`                        | Uma ou mais pessoas                           |
| Parte de cada participante           | `shares`                       | Resultado do rateio, em centavos              |
| Quem deve a quem                     | `Obligation`                   | Derivado de cada despesa                      |
| Pagamento entre pessoas (acerto)     | `Payment`                      | Declarado, confirmado, contestado ou recusado |
| Comprovante de pagamento             | `PaymentProof`                 | Foto/arquivo do banco                         |
| Evidência da despesa                 | `ExpenseEvidence`              | Foto da notinha, print de fatura etc.         |
| Contestação de despesa               | `ExpenseDispute`               | Pedido de revisão ao dono do rolê             |
| Conta por consumo                    | `ConsumptionBill`              | Itens + o que cada um marcou                  |
| Rota inteligente / manual            | `smartRoute` / `manualRoute`   | Formas de acertar                             |
| Cobrança                             | `decideReminder`               | Lembretes pelo WhatsApp                       |

Identificadores do código em inglês; textos para o usuário em português.

## 3. Regras de negócio

### Despesas

- Toda despesa envolve **pelo menos duas pessoas** e pode ter **um ou mais pagadores**; a soma do que foi pago é o total.
- **Dinheiro sempre em centavos inteiros.** Frações de item (1/3 de uma porção) são exatas.
- **Formas de divisão**, escolhidas pelo dono do rolê:
  - **igual** entre os participantes escolhidos;
  - **valores informados** por participante (a soma tem que fechar com o total);
  - **cada um paga o que consumiu**: só disponível quando a conta tem itens, vindos da leitura da notinha ou digitados. Regras em "Conta por consumo".
- A despesa pode ter **só o valor total**, sem itens nem foto.
- **Divisão exata:** a soma das partes é sempre o total. O **centavo indivisível fica com quem pagou**, começando por quem pagou mais.
- **Histórico imutável:** corrigir cria uma nova versão e marca a anterior como substituída; anular guarda quem anulou e o motivo.
- **Evidência opcional** (foto da notinha, print de fatura, outro): todos veem se a despesa é **com** ou **sem evidência**, e se o valor do documento confere com o total. Evidência nunca é removida e acompanha as versões.
- **Contestação:** quem participa pode pedir revisão do valor ou da divisão. Só o dono do rolê decide; aprovar leva a uma nova versão. Enquanto a contestação está aberta, as cobranças de quem contestou ficam suspensas naquele rolê.
- **Registrada por / paga por** e datas fazem parte de toda despesa (auditoria).

### Pagantes do rolê

- Só o **dono do rolê** e os **pagantes** que ele declarar registram e corrigem despesas. Os demais participantes marcam o que consumiram e pagam o que devem.
- A **forma de divisão** de cada despesa é decidida pelo dono do rolê.
- Quem não é pagante e quer mudar algo tem dois caminhos:
  - **pedir para virar pagante**, informando o que pagou. O pedido já traz a divisão entre os pagantes: se a pessoa pagou parte de uma despesa que já existe, o total não muda e o pedido diz quanto sai de cada pagante. A aprovação do dono gera uma nova versão da despesa (ou uma despesa nova), e a pessoa passa a ser pagante no rolê de forma permanente;
  - **contestar** o valor ou a divisão (ver "Contestação" em "Despesas").
- Ao longo de vários rolês, quem pagou em um pode dever em outro; cada rolê é acertado separadamente (ver "Pagamentos e acertos").

### Conta por consumo ("cada um paga o que consumiu")

- Quem registra a conta publica a lista de itens; **cada um marca o que consumiu**, sem depender do dono. Ninguém marca mais do que sobrou na nota.
- **Quem marca primeiro** um item escolhe se ele é só seu, **dividido por todos da conta** ou **dividido com algumas pessoas**, que escolhe. Essas pessoas ficam vinculadas ao item automaticamente.
- Quem foi vinculado pode **sair** ("não consumi") ou **contestar** ("consumi menos", informando a quantidade). A parte liberada fica **pendente com o dono do rolê**, que recebe um alerta e pode **alertar os demais da conta** para alguém assumir.
- **Fechamento da conta:**
  - com todos os itens marcados, a conta fecha e vira despesa por itens; taxa de serviço e desconto ficam proporcionais ao consumo;
  - se o dono fechar antes, ele **quita sozinho** o que ficou pendente ou **desonera os demais** dessa parte;
  - sem isso, a conta aguarda alguém assumir a pendência ou todos marcarem a sua parte.
- **Fechou, acabou a responsa:** depois do fechamento, ninguém responde mais por mudanças na marcação.

### Quem deve a quem

- Na despesa com vários pagadores, a parte de cada participante é repartida entre os pagadores **na proporção do que cada um pagou** (ex.: Gustavo R$ 300 e Hyago R$ 200 → 60% / 40%).
- O arredondamento é feito em conjunto, garantindo que cada pessoa fique com saldo exatamente igual ao que pagou menos o que assumiu.

### Saldos

- Calculados **a partir do histórico** (despesas ativas + pagamentos confirmados); nunca guardados como um número que se atualiza.
- Por rolê: pago, assumido, **adiantado** (pago − assumido), enviado, recebido e **líquido**. A soma dos líquidos é zero.
- Resumo para quem deve: **devido originalmente / pago / pendente**.
- **Visão pessoa × pessoa:** ao tocar no nome de alguém, aparecem todas as despesas e pagamentos entre as duas pessoas, em todos os rolês, com origem, status, total e total por rolê. A visão do rolê mostra só o que é daquele rolê.

### Pagamentos e acertos

- O app **não movimenta dinheiro**: o pagamento é feito por fora (Pix) e registrado no app.
- **Declarado → confirmado.** Só pagamento confirmado entra no saldo.
- **Comprovante (opção B):** pagamento com comprovante, compartilhado direto do app do banco ou enviado, é **confirmado automaticamente**. O credor pode **contestar em até 3 dias**; contestado sai do saldo até ser confirmado ou recusado pelo credor. Sem comprovante, o credor confirma.
- **Leitura do comprovante:** antes de aceitar, o app lê o documento e **só aceita se for um comprovante de Pix**; qualquer outro documento é rejeitado. Da leitura saem valor, data, destinatário e o código único do Pix, que não pode ser usado em dois pagamentos.
- **Pagar também por outras pessoas:** quem paga em nome de alguém passa a ser credor dessa pessoa.
- **Acerto por rolê**, separado dos outros rolês. Ao acertar um, o app avisa que há contas em aberto em outros rolês e pergunta se a pessoa quer quitar também.
- **Na v1 não há compensação de saldos entre rolês diferentes** (confirmado; a compensação fica para os grupos ou a v2). A visão pessoa × pessoa mostra o total entre duas pessoas em todos os rolês.
- **Rota inteligente:** menor número de Pix dentro do rolê; ninguém precisa pagar quem pagou a despesa original. Mínimo exato até 16 pessoas com saldo em aberto; acima disso, maior devedor paga maior credor. A pessoa vê um **resumo** que explica a rota e quantos Pix ela economiza.
- **Rota manual:** cada um paga diretamente a quem deve, para quem não se sente seguro com a rota inteligente.
- Pagamentos declarados contam como feitos no planejamento da rota, para ninguém pagar duas vezes enquanto aguarda confirmação.

### Leitura de documentos (foto, print e PDF)

- O app lê **foto da notinha, print de tela e PDF** que tenham descrições e valores (fatura, nota, pedido de delivery) e monta um **rascunho** de despesa: descrição, data, total e, quando houver, itens e taxa de serviço. Word, Excel e outros formatos ficam fora do MVP.
- **A leitura nunca vira despesa sozinha:** a pessoa revisa e confirma. Se o documento traz itens, o rascunho pode virar conta por consumo; se não, uma despesa só com o total.
- O leitor **só extrai campos fixos e não executa nada** do que está no documento. O conteúdo do arquivo é tratado como dado não confiável.
- Extrai só o que a despesa precisa (descrição, valor, data). **O arquivo não é guardado por padrão**; a pessoa escolhe se quer guardá-lo como evidência da despesa.
- **Tamanho limitado:** imagens são reduzidas no celular e há limite de tamanho e de páginas por arquivo.
- **Recebimento:** no Android, o app instalado aparece na lista de "compartilhar". No iPhone, que não oferece isso a apps instalados da web, há um botão "Enviar documento" na tela. No computador, também vale arrastar e soltar.

### Entrada no rolê

- O dono do rolê cadastra cada participante com **nome e telefone**. No celular, pode escolher na agenda; na web, digita.
- O **telefone identifica a pessoa**: o mesmo número é a mesma pessoa em todos os rolês. O telefone é a credencial de entrada, então **nenhum participante lê o telefone de outro** (nem o próprio, pela sessão): a leitura é só do servidor, com checagem explícita.
- O dono distribui **um link único do rolê**, sem mensagem individual para cada participante, de uma destas formas:
  - no grupo do WhatsApp do rolê;
  - pelo "compartilhar" do celular, marcando vários contatos de uma vez;
  - por **QR code** na tela, para quem está na mesa.
- Quem abre o link **escolhe o próprio nome** na lista do rolê e **confirma digitando o próprio telefone**, que precisa conferir com o número cadastrado pelo dono.
- Na v1 a conferência é só do número digitado: quem sabe o telefone de um amigo consegue entrar como ele. O risco é aceito entre amigos, e o que for registrado errado pode ser contestado. O código de confirmação pelo WhatsApp está em [`evolucoes.md`](evolucoes.md).
- O WhatsApp pessoal do dono só é usado para compartilhar o link. Mensagens do app (lembretes e, depois, códigos) saem pela API oficial do WhatsApp.

### Cobrança pelo WhatsApp

- É **função do app**, não marketing. O consentimento vem nos **termos e condições aceitos no primeiro acesso**, que incluem o recebimento de lembretes de pagamento.
- Lembretes amigáveis, em tom de meme ("e o Pix, nada ainda?"), até o pagamento ser confirmado.
- **Regra de frequência:** intervalo mínimo entre lembretes (padrão 24 h) e horário comercial no fuso de São Paulo (padrão 10 h–20 h).
- Depois de alguns lembretes (padrão 3), o chat oferece **pausar por alguns dias** (padrão 3); ao fim da pausa as cobranças voltam. Número de pausas limitado (padrão 2).
- Para quando não há mais nada a pagar e fica suspensa enquanto há contestação aberta.

### Grupos (ainda não implementados)

- A despesa existe **entre pessoas**; o grupo é um **contexto de consolidação**.
- O grupo pode criar despesas diretamente e reunir relações anteriores.
- Uma relação só entra na consolidação de um grupo quando estiver **vinculada explicitamente** ao grupo ou quando os envolvidos autorizarem.
- Coexistem a visão do grupo (saldo consolidado do grupo) e a visão pessoa × pessoa.
- Membros permanentes de um grupo precisam ter conta; participantes temporários de um rolê do grupo não.

## 4. Arquitetura

- **`src/domain`:** regras puras, sem I/O, com teste ao lado (`*.test.ts`). **`src/server`:** acesso a dados e casos de uso (server-only), com teste ao lado. Server actions fazem o papel de controller.
- **Toda regra de negócio fica no servidor.** A interface tem apenas regras de tela.
- **Criação de rolê:** quem cria só enxerga o rolê dentro da própria transação, até entrar como participante (`created_at = now()`); depois vale a regra de participação.
- **Multi-tenant por RLS:** toda tabela com RLS ligado, políticas por papel e identidade da pessoa vinda da sessão. Trabalho privilegiado passa por `asService`.
- **IDs:** `uuid` nativo.
- Padrões de cache, formulários, webhooks, cron e segurança seguem os do Kalu (ver `AGENTS.md`).

## 5. Etapas do projeto

Histórias `GOR-01` a `GOR-16`, uma branch e um PR cada (`feat/GOR-XX-nome`), na ordem de entrega: fundação (projeto, banco e RLS, domínio, sessão, layout e PWA), depois uma história por funcionalidade. O quadro do Trello "Gorole" guarda os cards.

## 6. Forma de trabalho

- Regras do agente em [`../CLAUDE.md`](../CLAUDE.md): investigar antes, apresentar estratégia e plano de commits, implementar só com autorização, validar cada commit.
- **Branches:** `feat/GOR-XX-descricao` para as histórias (minúsculas, hífen); `fix/`, `chore/` e `docs/` para o resto.
- **Commits:** mensagens em português, autor **lucasjesus06 <79674116+lucasjesus06@users.noreply.github.com>**, sem coautoria nem menção a ferramentas.
- **PRs:** abertos e integrados pelo Lucas. Antes de dizer onde um commit foi parar, conferir o estado real do PR. Trabalho novo depois de um merge vai numa branch nova a partir da `main`.
- **PRs:** não são abertos pela API. O agente entrega o link de comparação (`compare/main...<branch>?quick_pull=1`) e o Lucas abre.
