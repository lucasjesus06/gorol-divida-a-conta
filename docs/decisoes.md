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
- **Formas de divisão**, escolhidas pelo dono do rolê **a cada despesa**, de acordo com a situação (não há forma de divisão padrão do rolê):
  - **igual** entre todos os participantes do rolê, que já vêm marcados, porque o rolê contém todas e somente as pessoas que participaram dele;
  - **valores informados** por participante (a soma tem que fechar com o total);
  - **cada um paga o que consumiu**: só disponível quando a conta tem itens, vindos da leitura da notinha ou digitados. Regras em "Conta por consumo".
- A despesa pode ter **só o valor total**, sem itens nem foto.
- **Conta por consumo no app:** na aba Despesas, o dono ou um pagante abre **"Nova conta por consumo"** com os itens (descrição, quantidade e valor), taxa de serviço e desconto. Cada participante marca o que consumiu (quantidades exatas, como 1/3 de uma porção), pode **dividir um item com outras pessoas** (cada uma fica vinculada à sua fração), atualizar ("consumi menos") ou retirar ("não consumi"). Ninguém marca mais do que o item tem, nem com marcações ao mesmo tempo. **Ao fechar**, o app avisa que os itens sem dono serão divididos entre todos e quem fecha escolhe: **ratear entre todos os participantes** (inclusive quem pagou e quem não marcou nada), **ficar com a parte** ou **transferir a alguém**, que precisa **aceitar**; se recusar, a conta volta a ficar aberta. O fechamento gera a despesa "por itens", com taxa e desconto proporcionais ao consumo. Conta fechada não muda mais.
- **Quem registra:** só o **dono do rolê** e os **pagantes** que ele declara (na lista de participantes, "Tornar pagante"). Quem pagou numa despesa precisa ser o dono ou um pagante declarado. Corrigir e anular é de quem registrou ou do dono, e a anulação exige o motivo.
- **Pedir para virar pagante:** quem não é pagante abre a aba de despesas do rolê e escolhe "Pedir para virar pagante". O pedido traz **o que a pessoa pagou e a divisão entre os pagantes** e pode ser sobre **uma despesa nova** ou sobre **uma despesa já registrada** (o total não muda, só quem pagou). Só o dono vê todos os pedidos; cada pessoa vê os seus. **Aprovar** registra a despesa (ou cria a nova versão da existente) **e torna a pessoa pagante de forma permanente**; recusar guarda a observação do dono. Se a despesa mudou desde o pedido, aprovar é recusado e o dono deve recusar o pedido. A despesa aprovada fica registrada em nome do dono.
- **Duas formas de dividir entram na GOR-08:** igual e valores informados. A divisão por itens entra com a conta por consumo (GOR-10).
- **Registro seguro contra duplicidade:** cada formulário leva uma chave única, então um toque duplo ou um reenvio não cria duas despesas. O banco confere que pagamentos e partes somam o total, que todos estão no rolê confirmados e que os pagantes são permitidos, e **não deixa alterar nem apagar** o histórico financeiro.
- **Taxa de serviço**, quando houver, entra no total e é rateada junto com o resto (na conta por consumo, proporcional ao consumo de cada um).
- **Divisão exata:** a soma das partes é sempre o total. O **centavo indivisível fica com quem pagou**, começando por quem pagou mais.
- **Histórico imutável:** corrigir cria uma nova versão e marca a anterior como substituída; anular guarda quem anulou e o motivo.
- **Evidência opcional** (foto da notinha, print de fatura, outro): todos veem se a despesa é **com** ou **sem evidência**, e se o valor do documento confere com o total. Evidência nunca é removida e acompanha as versões. **Como é guardada (GOR-15):** em um **bucket privado** do Supabase Storage (`arquivos`), sem nenhum acesso direto pelo usuário. O app envia o arquivo em **duas etapas**: o servidor confere o pedido (quem pode anexar, tamanho e tipo) e entrega uma **permissão de envio de uso único**; o celular envia **direto ao armazenamento** (assim arquivo grande não esbarra no limite da requisição); em seguida o servidor **lê o que chegou, confere o tipo pelo conteúdo e o tamanho**, e só então libera o arquivo. O que não for o que dizia ser é apagado. Para abrir, o servidor confere a participação no rolê e entrega um **link que vale 5 minutos**.
  - **Limites:** evidência e comprovante até **10 MB** (JPEG, PNG, WebP ou PDF); foto de perfil até **2 MB** (JPEG ou WebP).
  - **Quem anexa:** evidência, quem lançou a despesa ou o dono do rolê; comprovante, só quem pagou. **Evidência e comprovante não são removidos**, nem por quem enviou; só a foto de perfil se remove ou se troca.
  - **Quem vê:** participantes confirmados do rolê; a foto de perfil, quem divide rolê com a pessoa.
- **Como a contestação funciona no app:** na tela da despesa, quem participa dela escolhe o motivo (o valor, a divisão, "não participei" ou outro) e explica. **Valor, divisão e outro motivo** são decididos só pelo dono; se ele aceitar, a contestação fica aceita e o dono **corrige a despesa em seguida** (nova versão). **"Não participei"** vale só na divisão por igual, não vale para quem pagou, e só é aceita quando **o dono e todos os pagantes** aceitam: aí o app cria sozinho a nova versão **sem a pessoa**, registrada em nome do dono; basta uma recusa para rejeitar. Cada pessoa tem uma contestação aberta por despesa. **Depois do encerramento (GOR-16c):** até **7 dias** depois de encerrado, a contestação abre normalmente e **o rolê continua encerrado**; se o dono a aceitar, ele **corrige a despesa mesmo com o rolê encerrado**, uma vez (a correção só vale na despesa contestada e aceita; despesa nova e anulação continuam bloqueadas). **Passados os 7 dias**, a pessoa precisa **confirmar que entendeu** que contestar agora afeta o histórico das relações e **reabre o rolê**: ele volta a ficar ativo, a reabertura fica registrada (quem, quando, por qual contestação e o encerramento anterior) e os participantes são avisados. Para encerrar de novo vale o fluxo de sempre.
- **Contestação:** quem participa pode pedir revisão do valor ou da divisão. Só o dono do rolê decide; aprovar leva a uma nova versão. Quem diz **"não participei"** pede para sair da divisão, e a marcação só vale **depois da aprovação** do dono do rolê **e de quem pagou a despesa** (de todos os pagadores, se forem vários), porque a parte dessa pessoa seria redistribuída entre os demais. Na divisão igual isso é feito **por despesa**: a pessoa só marca que não participou daquela despesa.
- **Prazo de contestação: 7 dias** depois do encerramento do rolê. Passado o prazo, ainda dá para contestar, mas o app **avisa que isso afeta o histórico das relações e reabre o rolê**, para o dono (que pode sair no prejuízo) avaliar a contestação. Enquanto a contestação está aberta, as cobranças de quem contestou ficam suspensas naquele rolê.
- **Registrada por / paga por** e datas fazem parte de toda despesa (auditoria).

### Pagantes do rolê

- Só o **dono do rolê** e os **pagantes** que ele declarar registram e corrigem despesas. Os demais participantes marcam o que consumiram e pagam o que devem.
- A **forma de divisão** de cada despesa é decidida pelo dono do rolê.
- Quem não é pagante e quer mudar algo tem dois caminhos:
  - **pedir para virar pagante**, informando o que pagou. O pedido já traz a divisão entre os pagantes: se a pessoa pagou parte de uma despesa que já existe, o total não muda e o pedido diz quanto sai de cada pagante. A aprovação do dono gera uma nova versão da despesa (ou uma despesa nova), e a pessoa passa a ser pagante no rolê de forma permanente;
  - **contestar** o valor ou a divisão (ver "Contestação" em "Despesas").
- Ao longo de vários rolês, quem pagou em um pode dever em outro. O que vale é a relação entre as pessoas (ver "Relação entre pessoas").

### Conta por consumo ("cada um paga o que consumiu")

- Quem registra a conta publica a lista de itens; **cada um marca o que consumiu**, sem depender do dono. Ninguém marca mais do que sobrou na nota.
- **Quem marca primeiro** um item escolhe se ele é só seu, **dividido por todos da conta** ou **dividido com algumas pessoas**, que escolhe. Essas pessoas ficam vinculadas ao item automaticamente.
- **Todos os participantes entram na conta, sem exceção**, inclusive quem a pagou: ele também assume a sua parte. Quem foi vinculado a um item pode **sair do item** ("não consumi") ou **contestar** ("consumi menos", informando a quantidade). A parte liberada fica **sem dono**, e quem registrou a conta recebe um alerta e pode **alertar os demais** para alguém assumir.
- **Fechamento da conta:**
  - com todos os itens marcados, a conta fecha e vira despesa por itens; taxa de serviço e desconto ficam proporcionais ao consumo;
  - antes de fechar, o app **avisa que os itens não atribuídos serão divididos entre todos os participantes**, e quem fecha escolhe: **ratear** entre todos ou **transferir** a parte sem dono a alguém que se manifestou. Quem pagou o cartão e não quer deixar a conta no prejuízo pode **transferir para si mesmo**;
  - quem recebe a parte transferida **precisa aceitar** (quando quem fecha transfere para si mesmo, não há o que aceitar);
  - não existe "desonerar": a parte sem dono sempre fica com alguém.
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
- **Declarado → confirmado.** Só pagamento confirmado entra no saldo. No app, na aba **Pagamentos** do rolê, quem pagou **declara** (para quem, quanto e, se for o caso, **em nome de outra pessoa**) e **quem recebeu** confirma ("Recebi") ou recusa ("Não recebi"); o pagamento recusado fica no histórico e a decisão é uma vez só.
- **Comprovante (opção B):** pagamento com comprovante, compartilhado direto do app do banco ou enviado, é **confirmado automaticamente**. O credor pode **contestar em até 3 dias**; contestado sai do saldo até ser confirmado ou recusado pelo credor. **O comprovante é opcional, mas incentivado:** com ele a baixa é automática, mais prática e mais justa para todos. Sem ele, **o credor ainda pode dar a baixa**, marcando o pagamento como **confirmado** ("pagamento recebido"). O público é pequeno e de amigos próximos, então a honestidade dos participantes é a base, e o comprovante existe para facilitar e dar justiça, não para vigiar.
- **Leitura do comprovante:** antes de aceitar, o app lê o documento e **só aceita se for um comprovante de Pix**; qualquer outro documento é rejeitado. Da leitura saem valor, data, destinatário e o código único do Pix, que não pode ser usado em dois pagamentos. A leitura confere formato, campos e coerência com o pagamento declarado, mas **não prova sozinha que o documento é autêntico** (uma imagem bem editada pode passar), e por isso a contestação do credor em 3 dias continua como segurança. Quando **valor ou destinatário do comprovante diferem do pagamento declarado**, o app **recusa a baixa automática e pede a confirmação do credor**. A prova real virá com a integração bancária (ver [`evolucoes.md`](evolucoes.md)).
- **Pix direto do app:** como a **chave Pix é cadastrada** (ver "Configurações"), na hora de pagar o app já mostra o **QR code e o Pix copia e cola** com o valor, sem ninguém precisar pedir a chave.
- **Pagar também por outras pessoas:** quem paga em nome de alguém passa a ser credor dessa pessoa.
- **Acerto:** a pessoa escolhe entre um **acerto individual por rolê** ou **pagar tudo de uma vez** (o saldo total com aquela pessoa). O acerto por rolê existe para que a pessoa veja **de onde veio** a dívida.
- **Saldos no app:** a aba **Acertos** do rolê mostra o saldo de cada um, o resumo de quem deve (devido, pago e pendente), as rotas (inteligente por padrão, com quantos Pix economiza, e manual) e, para cada Pix que a pessoa deve fazer, um botão **Pagar** que leva à aba Pagamentos já preenchida; avisa quando há dívida em outros rolês. O menu **Resumo** mostra, pessoa a pessoa, o que se deve e o que se tem a receber **somando todos os rolês** (a direção pode inverter); ao tocar numa pessoa, veja **de onde vem** cada valor por rolê e o histórico, e escolha **pagar um rolê** ou **pagar o total**. Quem **não tem conta** não entra na soma entre rolês: aparece só dentro de cada rolê. Pagamentos declarados já contam para a rota, para ninguém pagar duas vezes.
- **Rota inteligente:** menor número de Pix dentro do rolê; ninguém precisa pagar quem pagou a despesa original. Mínimo exato até 16 pessoas com saldo em aberto; acima disso, maior devedor paga maior credor. A pessoa vê um **resumo** que explica a rota e quantos Pix ela economiza.
- **Rota manual:** cada um paga diretamente a quem deve, para quem não se sente seguro com a rota inteligente.
- Pagamentos declarados contam como feitos no planejamento da rota, para ninguém pagar duas vezes enquanto aguarda confirmação.

### Relação entre pessoas (longo prazo)

- A relação financeira é **entre pessoas**, e o rolê é só o contexto em que cada valor nasceu. O saldo entre duas pessoas soma despesas, pagamentos confirmados e anistias de **todos os rolês** e tem sinal: quem deve e quem recebe é **consequência da soma**, nunca um dado gravado.
- Por isso **a direção pode inverter**: quem devia pode virar credor se, num rolê seguinte, pagar mais do que assumiu. A compensação (netting) entre rolês vale **por par de pessoas**; a compensação entre várias pessoas e vários rolês ao mesmo tempo fica para depois ([`evolucoes.md`](evolucoes.md)).
- **Encerrar um rolê não apaga dívida.** Ele só deixa de aceitar lançamentos novos; o que ficou em aberto continua na relação entre as pessoas e se soma ao próximo rolê. Quando a dívida inverte, a **cobrança segue a direção atual** e o contador de lembretes e de pausas do par recomeça.
- **Só quem tem conta tem relação de longo prazo.** Convidados (acesso temporário, identificados apenas por telefone) **não devem a longo prazo**: precisam encerrar as dívidas **dentro do rolê**. Só o telefone é pouco para identificar alguém, e por isso não existe histórico de quem não tem conta; a conta é o que traz a relação de longo prazo e o histórico.
  - Ao entrar, o convidado é convidado a **criar cadastro** (cartão na tela inicial e na tela de entrada aprovada), pedido que usa o **nome e o telefone que a pessoa já tem** e só pede o e-mail; o **vínculo do histórico à conta é feito pela sessão do convidado, e não pelo telefone**. O dono vê, na lista de participantes, quem **pediu cadastro**. O cadastro que depende da **aprovação do super administrador**. Enquanto o pedido estiver pendente, **o rolê não encerra**; se for recusado, o convidado precisa **pagar**.
  - **Convidado que tem a receber** segue a mesma regra: ou o rolê é acertado, ou ele cria conta (e informa a chave Pix no cadastro). Ele também pode **recusar a conta e informar a chave Pix manualmente** para receber, uma opção que o devedor não tem.
  - Ao encerrar o rolê com dívida de convidado, ele escolhe: **criar cadastro** ou **pagar agora**. Quando pede o cadastro, o **dono do rolê fica ciente**.
  - O dono, ao tentar encerrar o rolê, é **informado de quais pessoas sem conta ainda devem**. Enquanto não pagarem nem tiverem conta, o rolê não se encerra.
- **Como encerrar e sair funcionam hoje (GOR-16a):**
  - **Encerrar** é só do dono e só quando **nada está em aberto**: saldos zerados, nenhum pagamento esperando confirmação, nenhuma conta por consumo aberta e nenhum convidado com pedido de cadastro pendente. A tela mostra **o que ainda impede**, com os nomes e valores. Fica registrado quem encerrou e quando. Encerrar **não apaga dívida**.
  - **Sair do rolê** (a própria pessoa) e **remover** (**só o dono**) seguem a mesma cautela: só acontece quando a pessoa **não deve nem tem a receber de ninguém** no rolê, e não tem pagamento esperando nem itens em conta aberta. A conferência olha **todas as outras pessoas, não só o dono**, para não deixar um terceiro sem receber, ou sem ter a quem pagar, por causa da saída. O dono não sai: ele encerra o rolê.
  - Quem saiu **perde o acesso ao rolê e não volta sozinho**, mas a linha dele fica: o **nome continua nas despesas e nos saldos antigos**. A pessoa removida e o dono (quando alguém sai) são avisados.
- **Encerrar com saldo aberto:** o dono encerra sozinho se ele for o único com valor a receber no rolê. Se houver outras pessoas a receber, **votam só as que têm a receber** (quem deve não vota), cientes de que a dívida entre as pessoas continua e só o rolê se encerra. **O silêncio por 3 dias vale como aceite**; um "não" mantém o rolê aberto.
  - **Como funciona hoje (GOR-16b):** o dono toca em **"Pedir encerramento"** (só quando o único bloqueio é o saldo em aberto; pagamento esperando, conta aberta ou cadastro pendente continuam impedindo). Se **só o dono** tem a receber, o rolê encerra na hora. Se há outros, abre-se uma **votação só de quem tem a receber**, com o **voto do dono já como aceito**; quem deve não vota. Os votantes são avisados e têm **3 dias**; **um "não" mantém o rolê aberto**, todos aceitando encerra na hora e **o silêncio depois do prazo vale como aceite**. **Se o saldo mudar durante a votação** (pagamento, despesa nova), ela é **cancelada** e o dono precisa pedir de novo, porque o voto foi dado sobre aquele saldo. **Convidado sem conta que ainda deve impede o pedido**: precisa pagar ou criar o cadastro.
- **Anistia:** só o **credor** perdoa, e só até o que tem a receber naquele momento. É um **lançamento imutável** no histórico (quem, quando e quanto), que reduz o saldo sem apagar nada.
  - **uma pessoa por vez:** o credor abre a pessoa, vê o **resumo das dívidas** que ela tem com ele (por rolê e por despesa) e **seleciona** o que perdoar: uma despesa, várias, todas, só uma parte do valor ou nenhuma. Se a pessoa deve três dívidas de três rolês, ele escolhe quais;
  - **a pessoa anistiada recebe uma notificação** listando as despesas perdoadas, **uma notificação por anistia**;
  - o credor também tem **alertas e um resumo do que lhe devem** para decidir.
- **Origem da dívida sempre visível:** cada pessoa vê **a quem deve e quanto**, e ao tocar numa dívida vê o **histórico de rolês** que a formam e, dentro de cada rolê, as despesas. Como o saldo soma vários rolês e pode ter sinais diferentes, a tela mostra o valor de cada rolê com o seu sinal e o total.
- **Despesas compartilhadas permanentes** (motor de despesas compartilhadas permanentes): quem divide o mesmo fundo pagador (cônjuges, por exemplo) pode **optar por declarar isso**, numa seção das **configurações da pessoa**. É sempre opcional, e a outra pessoa precisa **aceitar**, porque a declaração muda o saldo dela. Regras:
  - **a divisão do rolê não muda para ninguém.** Com 5 pessoas e divisão igual, a conta é dividida por 5, como sempre. Cada pessoa do fundo continua sendo uma pessoa, com a sua parte e o seu consumo; quem tem cônjuge e quer, marca o consumo dele e o do cônjuge. **Os demais participantes não sentem diferença nenhuma** e os valores que devem ficam inalterados;
  - **só a relação entre as duas pessoas do fundo é neutra:** entre elas não há dívida, Pix nem pagamento. Se uma paga a conta, a outra não lhe deve nada pela parte dela;
  - **a dívida que já existia entre as duas é perdoada no ato**, com uma anistia visível, e **só entre as duas**; a dívida de cada uma com terceiros não muda;
  - **ao pagar a terceiros, a pessoa pode, se quiser, pagar também a parte de quem divide o fundo com ela.** É uma opção, e pode vir sugerida automaticamente, mas não é obrigatória: o cônjuge pode ter renda própria e pagar a sua parte. Pagar pelo cônjuge **não cria dívida entre os dois**;
  - **os lembretes vão para as duas pessoas**, porque cada uma segue sendo uma pessoa; só o fundo é compartilhado;
  - **desfazer** a declaração vale **só daí em diante**: o que foi lançado enquanto ela existia fica como estava, e a anistia já dada continua valendo;
  - **só as duas pessoas veem a declaração** (quem declarou, desde quando e os detalhes); quem paga em nome da outra aparece como pagamento normal;
  - **transparência na rota de acerto:** onde a rota deixaria de mostrar uma transferência entre as duas pessoas, o app mostra um aviso que, ao tocar (ou passar o mouse), explica que **não há transferência entre elas porque têm despesas compartilhadas permanentes**, o que torna desnecessários os pagamentos de uma para a outra, já que a origem do dinheiro é a mesma, com exemplos como cônjuges. Assim ninguém estranha a ausência. Os demais participantes veem **só esse aviso**, e não os detalhes da declaração; ao aceitar, as duas pessoas são informadas de que isso aparece nos rolês que dividem.
- Ao declarar um pagamento no sentido contrário ao do saldo atual, o app avisa que a outra pessoa é quem deve.

### Acesso e cadastro

- **Convidado entra sem conta**, pelo link do rolê (ver "Entrada no rolê"). Ele participa do rolê em que foi cadastrado, mas **não cria rolê**. Tecnicamente, recebe uma sessão sem e-mail nem senha que só passa a representar uma pessoa depois que o telefone digitado bate com o cadastrado pelo dono.
- **Conta só mediante aprovação.** Há duas portas, e as duas terminam no mesmo estado de conta aprovada:
  - **pedido de acesso:** a pessoa toca em "enviar para análise" e o pedido chega a um **painel de super administrador**, onde o Lucas aprova ou recusa;
  - **convite:** o Lucas gera o convite e a pessoa se cadastra por ele. O convite é de **uso único**, vale por **7 dias** e só o resumo (hash) dele fica guardado; o link aparece uma única vez, na hora de gerar.
  - a aprovação cria o acesso no Supabase e a pessoa pelo telefone (assumindo a que um dono de rolê já tivesse cadastrado), tudo ou nada: se o banco falhar, o acesso é desfeito.
- Só quem tem conta aprovada **cria rolê**. Depois de aprovada, a pessoa faz o cadastro e o login pela própria aplicação, **sem senha: por código de 6 dígitos enviado por e-mail** (sem custo). Um link mágico não serve bem a quem usa o app instalado, porque no iPhone o link abre no navegador e não no app. **Senha comum** só entra se o envio de e-mail se mostrar inviável.
- **Sem cotas nem limites de uso no MVP:** serão poucos testadores. A leitura de documentos tem custo, então o controle de gasto fica no próprio provedor, e não no app.
- **Super administrador:** papel de sistema, só o Lucas no MVP, marcado direto no banco (tabela `super_admins`), sem tela. Vê pedidos, convites e contas, e **toda aprovação ou recusa fica registrada** (quem, quando).

### Configurações

Há três níveis de configuração, todos em telas do aplicativo:
- **Pessoa:** dados do cadastro (nome, telefone, e-mail e **chave Pix, obrigatória, pedida no primeiro acesso da conta**, para o app gerar QR code e Pix copia e cola na hora de pagar), preferências de notificação e de exibição e a declaração de **despesas compartilhadas permanentes**. A chave Pix é usada para gerar o Pix copia e cola e **só aparece para quem deve a essa pessoa**.
  - **Tipo da chave escolhido pela pessoa** (CPF, CNPJ, celular, e-mail ou chave aleatória) e validado por tipo (dígitos do CPF/CNPJ, celular no formato internacional). O banco só guarda a chave com o tipo, e **o usuário não tem permissão de leitura dessa coluna**: o servidor a entrega só a quem precisa pagar aquela pessoa, até o valor devido (por dívida direta ou pela rota do rolê).
  - **Foto de perfil e apelido (GOR-20b):** a foto é **recortada em quadrado e reduzida a 512 px no aparelho** (isso também tira os dados da câmera, como a localização), vai para o armazenamento privado (JPEG ou WebP, até 2 MB) e **só quem divide rolê com a pessoa a vê**; sem foto, continua a inicial colorida. A foto nova substitui a antiga, e dá para remover. O **apelido** (até 40 caracteres, vazio volta ao primeiro nome) é **só para a própria pessoa e para as mensagens de cobrança**; nos rolês vale o nome que o dono cadastrou. O telefone aparece só para a própria pessoa.
  - **Administração fica dentro de Configurações**, visível só ao super admin, e permite **revogar um convite** ainda não usado (registra quem e quando).
- **Rolê (dono do rolê):** na aba **Ajustes** do rolê, só o dono, com o rolê aberto: **prazo da votação de encerramento**, **prazo de contestação depois do encerramento** (dentro dos limites do sistema), **divisão sugerida** (por igual ou por valores), **rota de acerto sugerida** (inteligente ou manual) e **taxa de serviço sugerida** (sem taxa, 10% ou 13%). Em branco vale o padrão do sistema. A divisão, a rota e a taxa são **só sugestões que já vêm marcadas**: a forma de divisão continua sendo escolhida em cada despesa.
- **Sistema (super administrador):** os parâmetros dos **motores de regras**, como os da cobrança (intervalo, janela de horário, quando oferecer pausa, duração e número de pausas) e o prazo para contestar um comprovante.
- Cada parâmetro tem **valor padrão e limites mínimo e máximo**, e toda mudança é registrada. Mudar um parâmetro vale daí em diante e **não reescreve o histórico**.
  - **Como funciona (GOR-20d):** os parâmetros do sistema ficam em **Configurações, Parâmetros** (só o super admin), agrupados em **Cobrança** e **Encerramento e contestação**. Cada um mostra descrição, limites, valor padrão, se foi alterado e o botão **"Voltar ao padrão"**; salvar pede **confirmação** ("tem certeza?"). O banco guarda só o que foi alterado (sem linha, vale o padrão) e **cada mudança fica no histórico**, que não se altera nem se apaga: quem mudou, quando, o valor anterior e o novo. Valor fora dos limites ou não inteiro é recusado com a mensagem dos limites.
  - **Três níveis, com esta precedência:** padrão do sistema, depois o **ajuste do rolê** (só o dono, dentro dos limites do sistema), depois a preferência da pessoa (só onde faz sentido, como avisos). **Cobrança, prazo de contestação do comprovante e validade de convite e de link ficam só no sistema ou fixos**; governança do grupo (prazo da votação de encerramento, prazo de contestação depois do encerramento, forma de divisão, rota e taxa de serviço padrão) é a que o dono poderá ajustar por rolê (20f).

### Leitura de documentos (foto, print e PDF)

- O app lê **foto da notinha, print de tela e PDF** que tenham descrições e valores (fatura, nota, pedido de delivery) e monta um **rascunho** de despesa: descrição, data, total e, quando houver, itens e taxa de serviço. Word, Excel e outros formatos ficam fora do MVP.
- **A leitura nunca vira despesa sozinha:** a pessoa revisa e confirma. Se o documento traz itens, o rascunho pode virar conta por consumo; se não, uma despesa só com o total.
- O leitor **só extrai campos fixos e não executa nada** do que está no documento. O conteúdo do arquivo é tratado como dado não confiável.
- Extrai só o que a despesa precisa (descrição, valor, data). **O arquivo não é guardado por padrão**; a pessoa escolhe se quer guardá-lo como evidência da despesa.
- **Tamanho limitado:** imagens são reduzidas no celular e há limite de tamanho e de páginas por arquivo.
- **Recebimento:** no Android, o app instalado aparece na lista de "compartilhar". No iPhone, que não oferece isso a apps instalados da web, há um botão "Enviar documento" na tela. No computador, também vale arrastar e soltar.

### Entrada no rolê

- O dono do rolê cadastra cada participante com **nome e telefone**. No celular (Android com Chrome), pode escolher na agenda; nos demais, digita.
- O **nome é válido só dentro daquele rolê** e o dono é quem o digita. Se o telefone já pertence a alguém, o rolê mostra o nome digitado pelo dono, e **o app nunca revela o nome de cadastro dessa pessoa**. Os nomes não se repetem dentro de um rolê (sem diferenciar maiúsculas).
- O **telefone identifica a pessoa**: o mesmo número é a mesma pessoa em todos os rolês. **Nenhum participante lê o telefone de outro.** Só o **dono** lê o telefone dos participantes do seu rolê, porque precisa dele para cobrar, e a leitura é feita pelo servidor, com a checagem de dono antes.
- O dono gera **um link do rolê** (aparece uma única vez, com QR code e botão de compartilhar), que vale **3 dias** e pode ser **revogado ou renovado**: gerar outro revoga o anterior. O link só mostra o nome do rolê e os nomes ainda livres.
- Quem abre o link **escolhe o próprio nome na lista** e **confirma digitando o próprio telefone**, que precisa conferir com o cadastrado pelo dono. Um nome já escolhido some da lista. Depois disso a pessoa fica **aguardando a aprovação do dono**, e só então entra no rolê: **a aprovação vale para aquele rolê**, e a pessoa não vê os outros rolês em que também esteja cadastrada até serem aprovadas neles. Quem entra recebe uma sessão de convidado (login anônimo), ligada à pessoa no ato da aprovação.
- **Limite de tentativas:** 5 telefones errados por pessoa e 30 por rolê, em 60 minutos; passando disso, nem o telefone certo entra até a janela passar.
- **Liberar o nome:** o dono pode devolver a vaga de quem entrou (por engano ou por impostor); a pessoa de verdade escolhe o nome de novo e passa pela aprovação, e a sessão anterior é substituída.
- **Quem já tem conta aprovada** não usa o link: é cadastrada pelo dono e entra no rolê assim que faz o login. Aprovar uma conta confirma as vagas em que a pessoa já estava cadastrada.
- Na v1 a conferência é o telefone digitado mais a aprovação do dono. Quem sabe nome e telefone de um amigo e chega antes dele pode pedir para entrar como ele; o dono vê isso (o nome do amigo some da lista) e rejeita. O código de confirmação pelo WhatsApp está em [`evolucoes.md`](evolucoes.md).
- Quem não está na lista do dono não entra: o dono precisa cadastrá-lo antes.
- O WhatsApp pessoal do dono só é usado para compartilhar o link. O envio dos lembretes está em "Cobrança pelo WhatsApp".

### Cobrança pelo WhatsApp

- **Decisão do Lucas (2026-11-27): a cobrança da primeira versão é por aviso no app e envio manual pelo super admin.** Há uma **tela dedicada ao super admin** (`/configuracoes/cobrancas`) com a fila de quem deve e já pode ser cobrado, a **mensagem já escrita** e o botão **"Abrir WhatsApp"**, que abre o WhatsApp Business **na conversa certa, com o texto pronto**; o super admin só toca em enviar, contato por contato. Também há o botão **"Avisar no app"** (lista de avisos e push, GOR-13). A **API oficial da Meta** (lembrete automático por modelos aprovados) fica como evolução, em [`evolucoes.md`](evolucoes.md). O **tom de meme é mantido** nos textos.
- **Textos editáveis pelo super admin:** de 1 a 10 textos de até 600 caracteres, com as variáveis `{nome}`, `{credor}`, `{valor}`, `{rolês}` e `{chave_pix}`; variável desconhecida é recusada. Os textos **giram a cada cobrança**. Sem texto próprio, valem três textos padrão em tom de meme.
- **Quem se cobra:** a cobrança segue a **relação entre duas contas** (o saldo líquido entre todos os rolês, na direção atual). Convidados sem conta não entram na fila.
- **A regra é conferida de novo na hora de registrar o disparo**, para uma tela desatualizada não mandar dois lembretes dentro do intervalo. Cada disparo fica no histórico (quem, quando, canal e número do lembrete), que não se altera nem se apaga.
- **Pausa sem chat:** quando o devedor pede, o super admin **registra a pausa** (disponível depois de 3 cobranças, 3 dias, no máximo 2).
- **Avisos no app (GOR-13):** cada aviso fica numa **lista** da pessoa (só ela lê; ninguém cria aviso pelo acesso do usuário, só o servidor) e, se ela ligou o push no aparelho, também chega como notificação. O endereço do aviso é sempre **interno ao app**. A inscrição é **por aparelho**, e o aparelho que o navegador informa como expirado é removido sozinho. **Falha ao avisar nunca desfaz** o pagamento, a despesa ou o pedido que a causou. As chaves VAPID ficam só em variáveis de ambiente.
- É **função do app**, não marketing. O consentimento vem nos **termos e condições aceitos no primeiro acesso**, que incluem o recebimento de lembretes de pagamento.
  - **Como é hoje (GOR-20c):** toda conta, no primeiro acesso, é levada à tela de **termos de uso** e marca **dois quadrinhos obrigatórios**: o aceite dos termos e o **consentimento para os lembretes de pagamento**. O aceite guarda **a versão do texto, a data e o consentimento**, e **não se apaga nem se altera**; mudou a versão, todos aceitam de novo. Em **Configurações, Privacidade**, a pessoa lê os termos e pode **retirar (e devolver) o consentimento dos lembretes**: retirado, a cobrança fica bloqueada para ela, e **a dívida continua registrada**. A fila de cobranças do super admin só libera quem aceitou a versão vigente e não retirou o consentimento. Convidados sem conta não aceitam termos (não são cobrados).
- Lembretes amigáveis, em tom de meme ("e o Pix, nada ainda?"), até o pagamento ser confirmado.
- **Regra de frequência:** intervalo mínimo entre lembretes (padrão 24 h) e horário comercial no fuso de São Paulo (padrão 10 h–20 h).
- Depois de alguns lembretes (padrão 3), o super admin pode **registrar uma pausa de alguns dias** (padrão 3), quando o devedor pedir; ao fim da pausa as cobranças voltam. Número de pausas limitado (padrão 2).
- Para quando não há mais nada a pagar e fica suspensa enquanto há contestação aberta.

### Grupos (ainda não implementados)

- A despesa existe **entre pessoas**; o grupo é um **contexto de consolidação**.
- O grupo pode criar despesas diretamente e reunir relações anteriores.
- Uma relação só entra na consolidação de um grupo quando estiver **vinculada explicitamente** ao grupo ou quando os envolvidos autorizarem.
- Coexistem a visão do grupo (saldo consolidado do grupo) e a visão pessoa × pessoa.
- Membros permanentes de um grupo precisam ter conta; participantes temporários de um rolê do grupo não.

### Estrutura e experiência do produto (parecer um SaaS)

- O produto deve **parecer uma plataforma sólida, e não uma página de apresentação**: menus de navegação, **telas de resumo e painéis**, painéis de configuração e **opções claras para criar e gerenciar** coisas. A pessoa deve poder **explorar**.
- A estrutura nasce com essa característica e vai sendo modelada aos poucos: não é preciso ter tudo pronto, mas a tela inicial deixa de ser uma apresentação (título grande, frase de efeito) e passa a ser **um painel**, com o resumo do que importa e os atalhos.
- Exemplos do que isso significa:
  - **navegação fixa** entre as áreas (início, **rolês** em andamento, **histórico**, resumo do que se deve e se tem a receber, configurações), com **Rolês e Histórico em menus separados**: os rolês encerrados saem de "Rolês" e ficam em "Histórico"; com menu lateral em tela larga e barra inferior no celular;
  - **painel do rolê** com visões separadas (resumo, participantes, despesas, acertos, ajustes), em vez de uma página só;
  - **gestão de participantes dentro do rolê:** ver, adicionar e remover pessoas depois de criado. A remoção respeita o histórico: quem já tem lançamentos não some do histórico (ver GOR-16);
  - **painel de administração e de configurações** como seções do menu.
- **O visual continua como está:** cores, fonte (Plus Jakarta Sans), botões e cantos arredondados são do gosto do Lucas e **não mudam**. A mudança é de estrutura e de organização das telas, não de estilo.

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
