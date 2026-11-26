# Pendências

Tudo o que ainda precisa ser feito ou decidido. O que fica para versões futuras está em [`evolucoes.md`](evolucoes.md). O trabalho está dividido nas histórias `GOR-01` a `GOR-20` do quadro "Gorole" no Trello. Ao concluir um item, remova-o daqui no mesmo PR.

## 1. Decisões em aberto

- **Verificação do login de ponta a ponta (GOR-04 em diante):** o ambiente do agente só sai por HTTPS e não alcança o Postgres do Supabase. O agente verifica com Postgres local e a camada de autenticação simulada, e o Lucas confere o login real, na máquina dele, com um projeto Supabase de desenvolvimento (separado do de produção) e as chaves só no `.env.local`.
- **Dependências novas além das do Kalu:** pacote de QR code (GOR-07) e Playwright nos testes de contexto (GOR-04).
- **Arquivos:** Supabase Storage com bucket privado e URL assinada (GOR-15).
- **Cobrança na v1:** web push e lista de avisos, com WhatsApp pela API oficial depois (GOR-13 e GOR-14).
- **Pagantes (GOR-09):** forma de divisão padrão do rolê, definida pelo dono e usada nas despesas dos pagantes.
- **Conta por consumo (GOR-10):**
  - quando o dono não pagou a conta, ele só desonera os demais se for pagante dela, ou quita sozinho, ou precisa do aceite de quem pagou;
  - "fechou, acabou a responsa": vale para a conta ou para o rolê? Proposta: fechar a conta trava a marcação, e a despesa gerada continua contestável enquanto o rolê estiver aberto;
  - o dono pode ratear a pendência entre todos da conta?
- **Participante que saiu do rolê:** hoje perderia o acesso. Decidir se continua vendo e pagando o que deve.
- **Remetente de e-mail (GOR-04):** o remetente padrão do Supabase tem limite baixo de envios e só entrega a membros da equipe do projeto, então os testadores exigem um remetente próprio (SMTP de um provedor com plano gratuito). Escolher o provedor.
- **Super administrador (GOR-19):** como o papel é atribuído ao Lucas (proposta: marcado direto no banco, sem tela) e qual o escopo do painel além de pedidos, convites e contas.
- **Convite (GOR-19):** validade do convite e se é de uso único (proposta: uso único e com prazo).
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
- **GOR-06:** acrescentar os atalhos (`shortcuts`) ao manifesto quando existirem as rotas de rolês.
- **GOR-13:** o `sw.js` já trata `push` e clique, mas o registro do service worker e a inscrição de push entram nessa história.

## 3. Fora do escopo desta versão

Grupos, leitura da NFC-e pela SEFAZ (a leitura de documentos por foto, print e PDF entra nas GOR-17 e GOR-18), documentos Word e Excel, Capacitor/APK, OpenAPI e compensação de saldos entre rolês.

## 4. Ações administrativas

- Desconectar o projeto do Lovable (integração com o GitHub), no painel do Lovable.
- Apagar a branch antiga `claude/eloquent-knuth-rpp6yj`.
- Arquivar o repositório `gorole-service` depois da GOR-03.
