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
- **Relação de longo prazo (GOR-12, GOR-14, GOR-16 e GOR-24):** pontos para confirmar:
  - **votação do encerramento:** quem vota (proposta: só quem tem saldo em aberto no rolê) e se o silêncio por 3 dias vale como aceite (proposta: sim; qualquer "não" mantém o rolê aberto);
  - **"não participei":** a marcação vale na hora ou só depois da aprovação do dono e de quem pagou? Proposta: fica pendente até a aprovação, porque a parte dessa pessoa passaria para os demais e o pagador poderia sair no prejuízo. Com vários pagadores, aprovam todos eles.
- **Fundo comum (história GOR-25), desenho a confirmar:**
  - nome na tela (proposta: "fundo comum");
  - **consentimento:** a outra pessoa precisa aceitar a declaração (proposta: sim, porque ela muda o saldo dela com terceiros);
  - **dívida anterior entre as duas:** é perdoada no ato da declaração, com um lançamento de anistia visível (proposta: sim, e só vale daí em diante);
  - **cobrança:** quem recebe o lembrete quando o fundo deve a alguém (proposta: o membro que fez a despesa, ou os dois);
  - **desfazer:** vale daí em diante, sem reescrever o histórico;
  - quem enxerga a declaração (proposta: quem divide algum rolê com os dois).
- **Participante que saiu do rolê:** hoje perderia o acesso. Decidir se continua vendo e pagando o que deve.
- **Remetente de e-mail (GOR-04):** o remetente padrão do Supabase tem limite baixo de envios e só entrega a membros da equipe do projeto, então os testadores exigem um remetente próprio (SMTP de um provedor com plano gratuito). Escolher o provedor.
- **Acesso por aprovação (GOR-19), o que ficou de fora:**
  - quem pede acesso **não recebe aviso** quando o pedido é decidido; precisa tentar entrar. Avisar por e-mail depende do remetente próprio;
  - o formulário público só tem o campo-armadilha e um pedido pendente por e-mail; **limite real de tentativas por IP** fica para quando houver o mecanismo da GOR-07;
  - o painel lista pedidos, convites e contas, mas ainda não **revoga** uma conta, não cancela convite nem mostra os pedidos já decididos.
- **Senha SMTP do Brevo:** a chave gerada vence em **27/11/2027**, e também expira após 90 dias sem uso. Renovar no Brevo e atualizar em **Authentication → SMTP Settings** no Supabase.
- **Configurações (GOR-20):**
  - confirmar a lista de parâmetros ajustáveis (cobrança, prazo de contestação do comprovante, forma de divisão, rota e taxa de serviço padrão);
  - **não são configuráveis** os invariantes financeiros: centavos exatos, histórico imutável, saldo calculado do histórico, só pagamento confirmado entra no saldo e quem não participa não vê o rolê;
  - formato aceito para a chave Pix (CPF, telefone, e-mail ou chave aleatória) e quem pode ver a chave;
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

- **Rolês (GOR-06), o que ficou de fora:**
  - **remover participante** e **encerrar rolê** ficam para a GOR-16 (remover com histórico de despesas quebraria os saldos);
  - editar o nome ou o tipo do rolê;
  - a seleção de contatos da agenda usa o Contact Picker, que só existe no Android com Chrome: **não foi possível validar neste ambiente**; teste num Android (o botão "Escolher da agenda" aparece só onde há suporte);
  - sala com código e QR ao vivo, foto na aprovação, link individual por contato, PIN ou passkey para o convidado voltar sozinho e 2FA do super admin: ver [`evolucoes.md`](evolucoes.md).

## 3. Fora do escopo desta versão

Grupos, leitura da NFC-e pela SEFAZ (a leitura de documentos por foto, print e PDF entra nas GOR-17 e GOR-18), documentos Word e Excel, Capacitor/APK, OpenAPI e compensação de saldos entre rolês.

## 4. Ações administrativas

- Desconectar o projeto do Lovable (integração com o GitHub), no painel do Lovable.
- Apagar a branch antiga `claude/eloquent-knuth-rpp6yj`.
- Arquivar o repositório `gorole-service` depois da GOR-03.
