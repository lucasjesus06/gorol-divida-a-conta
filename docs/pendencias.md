# Pendências

Tudo o que ainda precisa ser feito ou decidido. O que fica para versões futuras está em [`evolucoes.md`](evolucoes.md). O trabalho está dividido nas histórias `GOR-01` a `GOR-20` do quadro "Gorole" no Trello. Ao concluir um item, remova-o daqui no mesmo PR.

## 1. Decisões em aberto

- **Verificação do login de ponta a ponta (GOR-04 em diante):** o ambiente do agente só sai por HTTPS e não alcança o Postgres do Supabase. O agente verifica com Postgres local e a camada de autenticação simulada, e o Lucas confere o login real, na máquina dele, com um projeto Supabase de desenvolvimento (separado do de produção) e as chaves só no `.env.local`.
- **Dependências novas além das do Kalu:** pacote de QR code (GOR-07) e Playwright nos testes de contexto (GOR-04).
- **Cobrança (GOR-14), o que ficou de fora:**
  - o **aceite dos termos de uso** (com o consentimento para lembretes) ainda não existe; por enquanto a regra que o exige é dispensada (`TERMS_NOT_ENFORCED_YET` em `src/server/charges.ts`). Vira história própria, antes de qualquer envio automático;
  - os **parâmetros** (intervalo de 24 h, janela de 10 h às 20 h, pausa após 3, 3 dias, máximo 2) são fixos no código e viram ajustáveis na tela de parâmetros do sistema (parte 2 da GOR-20);
  - **não há envio automático nem cron**: o envio é manual, pela tela do super admin. A API da Meta (GOR-21 e GOR-22) fica como evolução;
  - **não foi possível validar neste ambiente** que o botão "Abrir WhatsApp" abre o app do WhatsApp Business na conversa certa (`wa.me`) nem o aviso no app em um aparelho; teste com seu número e o de um amigo;
  - a fila só inclui **contas**; dívida de convidado sem conta continua só dentro do rolê;
  - o histórico de cobranças ainda não aparece para o devedor nem para o credor.
- **Arquivos (GOR-15), o que ficou de fora:**
  - **Web Share Target** (receber o comprovante direto do app do banco, no Android): fica para a GOR-18;
  - a **foto de perfil** já tem base (tipo, limites e substituição da antiga), mas a **tela de envio e o Avatar com foto** entram na parte 2 da GOR-20;
  - **arquivos reservados e nunca confirmados** (quem escolheu o arquivo e fechou o app no meio) ficam como pendentes no banco e no armazenamento; falta uma limpeza periódica;
  - a imagem **não é reduzida no celular** antes do envio (limite de 10 MB); a redução e a retirada dos dados da foto (como localização) entram com a foto de perfil;
  - o valor e a data lidos do documento (`amountCents`, `documentDate` da evidência) ainda não são informados na tela, então a conferência "valor confere com o total" não aparece;
  - **não foi possível validar neste ambiente** o envio e a abertura de arquivo de verdade no Supabase Storage (o armazenamento é simulado nos testes). O bucket `arquivos` é criado sozinho no primeiro envio; para validar, anexe uma foto a uma despesa e abra-a em outro aparelho.
- **Conta por consumo (GOR-10):** o alcance de "fechou, acabou a responsa": vale para a conta ou para o rolê?
- **Contas temporárias, cadastro e comprovante (GOR-07, GOR-11, GOR-16 e GOR-20):**
  - **aviso ao dono quando o convidado pede cadastro:** além da marca "pediu cadastro" na lista de participantes, o dono recebe um aviso (GOR-13). A **sessão anônima antiga** do convidado continua existindo no Supabase depois da aprovação, sem uso;
  - **criptografar a chave Pix no banco**, além da política de acesso (ela pode ser o CPF): ainda sem decisão. Hoje a chave fica em texto na tabela `people`, **sem nenhuma permissão de leitura para o usuário**; só o servidor a lê, e só entrega a quem precisa pagar aquela pessoa;
  - **Pix informado manualmente** por quem recusa a conta e tem a receber: definir como fica guardado e por quanto tempo (proposta: só até o acerto do rolê).
- **Remetente de e-mail (GOR-04):** o remetente padrão do Supabase tem limite baixo de envios e só entrega a membros da equipe do projeto, então os testadores exigem um remetente próprio (SMTP de um provedor com plano gratuito). Escolher o provedor.
- **Acesso por aprovação (GOR-19), o que ficou de fora:**
  - quem pede acesso **não recebe aviso** quando o pedido é decidido; precisa tentar entrar. Avisar por e-mail depende do remetente próprio;
  - o formulário público só tem o campo-armadilha e um pedido pendente por e-mail; **limite real de tentativas por IP** fica para quando houver o mecanismo da GOR-07;
  - o painel lista pedidos, convites e contas e **revoga convite** ainda não usado (GOR-20), mas ainda não revoga uma conta nem mostra os pedidos já decididos.
- **Senha SMTP do Brevo:** a chave gerada vence em **27/11/2027**, e também expira após 90 dias sem uso. Renovar no Brevo e atualizar em **Authentication → SMTP Settings** no Supabase.
- **Configurações (GOR-20), o que já foi feito:** central em `/configuracoes` com **Chave Pix** (tipo escolhido pela pessoa: CPF, CNPJ, celular, e-mail ou aleatória, validado por tipo) e **Administração** dentro dela, só para o super admin, com o botão de **revogar convite**. A chave é **obrigatória no primeiro acesso** da conta (quem não tem é levado para a tela da chave) e o **QR code e o Pix copia e cola** aparecem na aba Acertos, só para quem precisa pagar aquela pessoa, até o valor devido (direto ou pela rota). Convidados sem conta não cadastram chave.
- **Configurações (GOR-20), o que ainda falta:**
  - **foto de perfil** (depende do armazenamento, GOR-15), **apelido**, **canal preferido dos avisos** (WhatsApp, app ou os dois), **situação dos lembretes** e **privacidade e termos**;
  - o **motor de regras** (parâmetros do sistema, como prazos, cobrança e taxa de serviço) e a tela para ajustá-lo;
  - o Pix copia e cola usa cidade "BRASIL" e o primeiro nome do recebedor, porque o app não sabe a cidade; **não foi possível validar neste ambiente que um app de banco aceita o código** (a conferência do CRC segue o vetor de referência). Teste pagando um valor pequeno;
  - confirmar a lista de parâmetros ajustáveis (cobrança, prazo de contestação do comprovante, forma de divisão, rota e taxa de serviço padrão);
  - **não são configuráveis** os invariantes financeiros: centavos exatos, histórico imutável, saldo calculado do histórico, só pagamento confirmado entra no saldo e quem não participa não vê o rolê;
  - o que é "personalizar a experiência" na tela da pessoa.
- **Valores padrão da cobrança** (passam a ser parâmetros do sistema, ver GOR-20): intervalo de 24 h, janela de 10 h às 20 h, pausa oferecida após 3 lembretes, pausa de 3 dias e limite de 2 pausas.
- **Textos dos lembretes** (tom de meme; frases de efeito de divulgação não entram na interface) e modelos de mensagem do WhatsApp, que precisam de aprovação da Meta.
- **Termos e condições** do primeiro acesso, incluindo o consentimento para os lembretes: texto a escrever, de preferência com orientação jurídica (LGPD).
- **Leitura de documentos (GOR-17, GOR-18):**
  - provedor do modelo de visão, chave de API e **quem paga** (sem limite por rolê no MVP; o teto de gasto fica no provedor);
  - texto dos termos de uso sobre o envio do documento a um terceiro (LGPD);
  - piloto com 15 a 20 documentos reais antes de prometer a função aos usuários;
  - valores dos limites de tamanho e de páginas;
  - se o comprovante de Pix com valor ou destinatário diferentes do pagamento declarado é rejeitado ou segue para o credor confirmar.
- **Armazenamento de arquivos:** limites de tamanho e por quanto tempo guardar.
- **Login de conta por código:** canal do código (WhatsApp ou e-mail) e quando a pessoa passa de participante de rolê a conta.
- **Grupos:** fluxo de vincular uma relação a um grupo, quem autoriza e como fica a visão consolidada.

## 2. Herdado da GOR-05

- **GOR-04:** ao criar o `src/proxy.ts`, incluir `/manifest.webmanifest` e `/sw.js` entre os caminhos públicos (o app só instala se o manifesto abrir sem login).
- **GOR-06 (resolvido):** o manifesto ganhou o atalho "Novo rolê".
- **Alertas e push (GOR-13), o que já foi feito:** lista de **Avisos** (`/avisos`, com sino e contagem de não lidos), **Avisos no aparelho** em Configurações (liga e desliga o push por aparelho) e os quatro primeiros avisos: **convidado pediu cadastro** e **pedido para entrar no rolê** (ao dono), **pagamento declarado** (a quem recebe) e **parte da conta transferida** (a quem recebeu). Um aviso que falha **nunca** desfaz a ação que o causou.
- **Alertas e push (GOR-13), o que falta:**
  - **configurar as chaves VAPID** (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) no `.env.local` e na Vercel; sem elas o push fica desligado e só a lista funciona. Gere com `npx web-push generate-vapid-keys`;
  - **avisos que ainda não existem:** pedido de pagante esperando o dono (hoje só o contador do resumo do rolê), contestação aberta e resposta a ela, pagamento confirmado ou recusado (ao devedor), comprovante e despesa nova. Entram com as histórias deles;
  - o aviso de cadastro do convidado vai ao **dono do rolê**; o **super admin** ainda não é avisado de pedido de acesso (vê o contador na tela inicial);
  - **no iPhone** o push só funciona com o app instalado na tela inicial. Não foi possível validar neste ambiente a entrega real do push (Android, desktop e iPhone) nem a assinatura em um navegador de verdade; teste ligando em Configurações > Avisos no aparelho e declarando um pagamento;
  - a lista mostra os 50 avisos mais recentes e não apaga avisos antigos.
- **GOR-19 (resolvido):** a criação de rolê exige conta aprovada (`app.is_account()`), porque o convidado também tem uma pessoa vinculada a uma sessão. As contas que já existiam foram marcadas como aprovadas na migração.

- **Histórico (GOR-26):** hoje lista só os **rolês encerrados**. Confirmar se ele também deve reunir o **histórico financeiro** (dívidas por pessoa, pagamentos e anistias, com a origem de cada valor); se sim, isso entra com a GOR-12.
- **Encerrar e sair (GOR-16), o que já foi feito (16a):** o dono **encerra o rolê** quando não há nada em aberto (nenhum saldo, pagamento esperando, conta por consumo aberta ou convidado com pedido de cadastro pendente); quem **sai** do rolê ou é **removido pelo dono** só o faz quando não há nada em aberto com **ninguém** (nem com o dono nem com terceiros), nem pagamento esperando, nem itens em conta aberta. O dono não sai. Quem saiu perde o acesso e **não volta sozinho**, mas **o nome continua nas despesas antigas**. Todos são avisados.
- **Encerrar e sair (GOR-16), o que falta:**
  - **16b, encerrar com saldo aberto:** votação só de quem tem a receber, com prazo de 3 dias e silêncio valendo como aceite; precisa de um processo que feche a votação vencida (ou fechar ao abrir a tela). Hoje, com saldo em aberto, o rolê **não encerra**;
  - **16c, contestar depois do encerramento:** prazo de 7 dias, aviso e **reabertura** do rolê. Hoje o rolê encerrado não aceita contestação nem reabre;
  - **bloqueio de dívida de convidado ao encerrar**: já vale pelo saldo em aberto, mas a escolha do convidado ("criar cadastro ou pagar agora") ao encerrar com dívida ainda não existe;
  - **corrida entre a conferência e a saída:** o servidor confere os saldos e depois registra a saída; uma despesa lançada no meio exato desses dois passos pode escapar. É uma janela de milissegundos, mas a trava definitiva no banco ainda não existe;
  - os gatilhos do banco que recusam pessoa de fora em despesa, pagamento e conta nova **ainda não olham quem saiu**; quem os impede hoje é o servidor;
  - a pergunta "encerrar a conta e também o rolê" ao fechar a única conta por consumo ainda não existe.
- **Estrutura de navegação (GOR-26), o que ficou de fora:** a navegação tem Início, Rolês, Resumo, Histórico e Configurações (a Administração fica dentro de Configurações, só para o super admin). A visão "Despesas" do rolê ainda é um espaço vazio com aviso e entra na GOR-08; remover participante continua na GOR-16.
- **Saldos e acertos (GOR-12), o que ficou de fora:** o **aviso ao pagar no sentido contrário** ao do saldo; a **anistia** (GOR-24) e as **despesas compartilhadas permanentes** (GOR-25), que mudam o cálculo; **pagar o total** registra um único pagamento no rolê em que a pessoa mais deve, e o abatimento por rolê no detalhe segue o que foi pago ali; a rota inteligente **ainda não evita transferência entre quem terá despesas compartilhadas permanentes** (GOR-25).
- **Pagamentos (GOR-11), o que ficou de fora:** o comprovante já **pode ser anexado** (GOR-15), mas a **leitura, a baixa automática e a contestação do credor em 3 dias** dependem do leitor (GOR-17), então por enquanto **só o credor dá a baixa**; as regras de domínio do comprovante já existem. O **aviso de pagamento no sentido contrário ao do saldo** ainda não existe.
- **Conta por consumo (GOR-10), o que ficou de fora:** **ler a nota por foto** (GOR-17) e os itens só são digitados; **corrigir uma despesa por itens** converte a divisão em valores informados (os itens não são recuperados); a pergunta "encerrar a conta e também o rolê" ao fechar a única conta vem com a GOR-16; quem entra no rolê depois de aberta a conta só entra no rateio se estiver confirmado no fechamento.
- **Contestação (GOR-09), o que ficou de fora:** contestação **depois do encerramento** do rolê, com o aviso e a reabertura (GOR-16); a **suspensão da cobrança** de quem tem contestação aberta, cuja regra de domínio (`hasOpenDispute`) já existe e passa a ser usada na GOR-14; e, quando o dono aceita uma contestação de valor ou divisão, a correção da despesa ainda é um passo manual, sem ligar a nova versão à contestação.
- **Pedido de pagante (GOR-09), o que ficou de fora:** o aviso ao dono de que há pedido esperando é só o contador no resumo do rolê (a notificação ainda não existe), e o contador da tela inicial ainda não soma os pedidos de pagante.
- **Despesas (GOR-08), o que ficou de fora:** contestação (GOR-09, segunda parte), divisão por itens (GOR-10), **remover um pagante declarado** e a **página do rolê não mostra ainda saldos** (GOR-12). O ajuste do prazo do rolê encerrado vale a partir da GOR-16.
- **Rolês (GOR-06), o que ficou de fora:**
  - editar o nome ou o tipo do rolê;
  - **entrada pelo link (GOR-07):** o prazo de 3 dias do link ainda não é parâmetro do sistema (GOR-20), e o limite de tentativas também é fixo. Não foi possível validar neste ambiente a sessão anônima real do Supabase (precisa de **Allow anonymous sign-ins** ligado) nem o compartilhar do celular; teste com o link num celular. O botão "Atualizar" da tela de espera é manual (sem tempo real);
  - a seleção de contatos da agenda usa o Contact Picker, que só existe no Android com Chrome: **não foi possível validar neste ambiente**; teste num Android (o botão "Escolher da agenda" aparece só onde há suporte);
  - sala com código e QR ao vivo, foto na aprovação, link individual por contato, PIN ou passkey para o convidado voltar sozinho e 2FA do super admin: ver [`evolucoes.md`](evolucoes.md).

## 3. Fora do escopo desta versão

Grupos, leitura da NFC-e pela SEFAZ (a leitura de documentos por foto, print e PDF entra nas GOR-17 e GOR-18), documentos Word e Excel, Capacitor/APK, OpenAPI e compensação de saldos entre rolês.

## 4. Ações administrativas

- Desconectar o projeto do Lovable (integração com o GitHub), no painel do Lovable.
- Apagar a branch antiga `claude/eloquent-knuth-rpp6yj`.
- Arquivar o repositório `gorole-service` depois da GOR-03.
