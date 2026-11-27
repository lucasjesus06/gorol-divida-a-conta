# Pendências

Tudo o que ainda precisa ser feito ou decidido. O que fica para versões futuras está em [`evolucoes.md`](evolucoes.md). O trabalho está dividido nas histórias `GOR-01` a `GOR-20` do quadro "Gorole" no Trello. Ao concluir um item, remova-o daqui no mesmo PR.

## 1. Decisões em aberto

- **Verificação do login de ponta a ponta (GOR-04 em diante):** o ambiente do agente só sai por HTTPS e não alcança o Postgres do Supabase. O agente verifica com Postgres local e a camada de autenticação simulada, e o Lucas confere o login real, na máquina dele, com um projeto Supabase de desenvolvimento (separado do de produção) e as chaves só no `.env.local`.
- **Dependências novas além das do Kalu:** pacote de QR code (GOR-07) e Playwright nos testes de contexto (GOR-04).
- **Arquivos:** Supabase Storage com bucket privado e URL assinada (GOR-15).
- **WhatsApp desde o MVP (GOR-14, GOR-21 e GOR-22):**
  - provedor: API oficial da Meta direto ou um intermediário (Twilio, Zenvia, Blip etc.);
  - conta WhatsApp Business verificada, com número dedicado: é o item mais demorado e **depende do Lucas**, então deve começar já (confirmar com a Meta quais documentos pedem);
  - modelos de mensagem aprovados pela Meta, incluindo o tom de meme: se a Meta classificar como marketing em vez de utilidade, o custo e a regra de consentimento mudam, então é preciso testar;
  - custo por mensagem e quem paga: os lembretes seguem até o pagamento, então o custo cresce com os dias em aberto (o intervalo é parâmetro do sistema, GOR-20);
  - consentimento registrado no aceite dos termos, inclusive para convidados sem conta;
  - não usar automação não oficial do WhatsApp Web: viola os termos e arrisca o banimento do número.
- **Conta por consumo (GOR-10):** o alcance de "fechou, acabou a responsa": vale para a conta ou para o rolê?
- **Contas temporárias, cadastro e comprovante (GOR-07, GOR-11, GOR-16 e GOR-20):**
  - **aviso ao dono quando o convidado pede cadastro:** hoje é só a marca "pediu cadastro" na lista de participantes; o aviso ativo (notificação) vem com a GOR-13. A **sessão anônima antiga** do convidado continua existindo no Supabase depois da aprovação, sem uso;
  - **criptografar a chave Pix no banco**, além da política de acesso (ela pode ser o CPF): ainda sem decisão. Hoje a chave fica em texto na tabela `people`, **sem nenhuma permissão de leitura para o usuário**; só o servidor a lê, e só entrega a quem precisa pagar aquela pessoa;
  - **Pix informado manualmente** por quem recusa a conta e tem a receber: definir como fica guardado e por quanto tempo (proposta: só até o acerto do rolê).
- **Participante que saiu do rolê:** hoje perderia o acesso. Decidir se continua vendo e pagando o que deve.
- **Remetente de e-mail (GOR-04):** o remetente padrão do Supabase tem limite baixo de envios e só entrega a membros da equipe do projeto, então os testadores exigem um remetente próprio (SMTP de um provedor com plano gratuito). Escolher o provedor.
- **Acesso por aprovação (GOR-19), o que ficou de fora:**
  - quem pede acesso **não recebe aviso** quando o pedido é decidido; precisa tentar entrar. Avisar por e-mail depende do remetente próprio;
  - o formulário público só tem o campo-armadilha e um pedido pendente por e-mail; **limite real de tentativas por IP** fica para quando houver o mecanismo da GOR-07;
  - o painel lista pedidos, convites e contas e **revoga convite** ainda não usado (GOR-20), mas ainda não revoga uma conta nem mostra os pedidos já decididos.
- **Senha SMTP do Brevo:** a chave gerada vence em **27/11/2027**, e também expira após 90 dias sem uso. Renovar no Brevo e atualizar em **Authentication → SMTP Settings** no Supabase.
- **Configurações (GOR-20), o que já foi feito:** central em `/configuracoes` com **Chave Pix** (tipo escolhido pela pessoa: CPF, CNPJ, celular, e-mail ou aleatória, validado por tipo) e **Administração** dentro dela, só para o super admin, com o botão de **revogar convite**. A chave é **obrigatória no primeiro acesso** da conta (quem não tem é levado para a tela da chave) e o **QR code e o Pix copia e cola** aparecem na aba Acertos, só para quem precisa pagar aquela pessoa, até o valor devido (direto ou pela rota). Convidados sem conta não cadastram chave.
- **Configurações (GOR-20), o que ainda falta:**
  - **foto de perfil** (depende do armazenamento, GOR-15), **apelido**, **avisos** (depende da GOR-13) e **privacidade e termos**;
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
- **GOR-13:** o `sw.js` já trata `push` e clique, mas o registro do service worker e a inscrição de push entram nessa história (alertas internos do app, não a cobrança).
- **GOR-19 (resolvido):** a criação de rolê exige conta aprovada (`app.is_account()`), porque o convidado também tem uma pessoa vinculada a uma sessão. As contas que já existiam foram marcadas como aprovadas na migração.

- **Histórico (GOR-26):** hoje lista só os **rolês encerrados**. Confirmar se ele também deve reunir o **histórico financeiro** (dívidas por pessoa, pagamentos e anistias, com a origem de cada valor); se sim, isso entra com a GOR-12.
- **Estrutura de navegação (GOR-26), o que ficou de fora:** a navegação tem Início, Rolês, Resumo, Histórico e Configurações (a Administração fica dentro de Configurações, só para o super admin). A visão "Despesas" do rolê ainda é um espaço vazio com aviso e entra na GOR-08; remover participante continua na GOR-16.
- **Saldos e acertos (GOR-12), o que ficou de fora:** o **aviso ao pagar no sentido contrário** ao do saldo; a **anistia** (GOR-24) e as **despesas compartilhadas permanentes** (GOR-25), que mudam o cálculo; **pagar o total** registra um único pagamento no rolê em que a pessoa mais deve, e o abatimento por rolê no detalhe segue o que foi pago ali; a rota inteligente **ainda não evita transferência entre quem terá despesas compartilhadas permanentes** (GOR-25).
- **Pagamentos (GOR-11), o que ficou de fora:** o **comprovante** (anexar, leitura, baixa automática e a contestação do credor em 3 dias) depende do armazenamento (GOR-15) e do leitor (GOR-17), então por enquanto **só o credor dá a baixa**; as regras de domínio do comprovante já existem. O **aviso de pagamento no sentido contrário ao do saldo** ainda não existe.
- **Conta por consumo (GOR-10), o que ficou de fora:** **ler a nota por foto** (GOR-17) e os itens só são digitados; **corrigir uma despesa por itens** converte a divisão em valores informados (os itens não são recuperados); a pergunta "encerrar a conta e também o rolê" ao fechar a única conta vem com a GOR-16; o aviso ativo a quem recebeu a parte transferida vem com a GOR-13; quem entra no rolê depois de aberta a conta só entra no rateio se estiver confirmado no fechamento.
- **Contestação (GOR-09), o que ficou de fora:** contestação **depois do encerramento** do rolê, com o aviso e a reabertura (GOR-16); **evidência da despesa** (GOR-15); a **suspensão da cobrança** de quem tem contestação aberta, cuja regra de domínio (`hasOpenDispute`) já existe e passa a ser usada na GOR-14; e, quando o dono aceita uma contestação de valor ou divisão, a correção da despesa ainda é um passo manual, sem ligar a nova versão à contestação.
- **Pedido de pagante (GOR-09), o que ficou de fora:** o aviso ao dono de que há pedido esperando é só o contador no resumo do rolê (a notificação vem com a GOR-13), e o contador da tela inicial ainda não soma os pedidos de pagante.
- **Despesas (GOR-08), o que ficou de fora:** contestação (GOR-09, segunda parte), divisão por itens (GOR-10), evidência da despesa (GOR-15), **remover um pagante declarado** e a **página do rolê não mostra ainda saldos** (GOR-12). O ajuste do prazo do rolê encerrado vale a partir da GOR-16.
- **Rolês (GOR-06), o que ficou de fora:**
  - **remover participante** e **encerrar rolê** ficam para a GOR-16 (remover com histórico de despesas quebraria os saldos);
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
