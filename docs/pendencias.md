# Pendências

Tudo o que ainda precisa ser feito ou decidido. O que fica para versões futuras está em [`evolucoes.md`](evolucoes.md). O trabalho está dividido nas histórias `GOR-01` a `GOR-16` do quadro "Gorole" no Trello. Ao concluir um item, remova-o daqui no mesmo PR.

## 1. Decisões em aberto

- **Autenticação:** login anônimo do Supabase, com o servidor vinculando a sessão à pessoa quando o telefone digitado bate com o cadastrado pelo dono (bloqueia GOR-04).
- **Verificação do app com login real:** projeto Supabase de desenvolvimento ou só PGlite e testes (GOR-04 em diante).
- **Dependências novas além das do Kalu:** pacote de QR code (GOR-07) e Playwright nos testes de contexto (GOR-04).
- **Arquivos:** Supabase Storage com bucket privado e URL assinada (GOR-15).
- **Cobrança na v1:** web push e lista de avisos, com WhatsApp pela API oficial depois (GOR-13 e GOR-14).
- **Pagantes (GOR-09):** forma de divisão padrão do rolê, definida pelo dono e usada nas despesas dos pagantes.
- **Conta por consumo (GOR-10):**
  - quando o dono não pagou a conta, ele só desonera os demais se for pagante dela, ou quita sozinho, ou precisa do aceite de quem pagou;
  - "fechou, acabou a responsa": vale para a conta ou para o rolê? Proposta: fechar a conta trava a marcação, e a despesa gerada continua contestável enquanto o rolê estiver aberto;
  - o dono pode ratear a pendência entre todos da conta?
- **Participante que saiu do rolê:** hoje perderia o acesso. Decidir se continua vendo e pagando o que deve.
- **Valores padrão da cobrança:** intervalo de 24 h, janela de 10 h às 20 h, pausa oferecida após 3 lembretes, pausa de 3 dias e limite de 2 pausas.
- **Textos dos lembretes** (tom de meme) e modelos de mensagem do WhatsApp, que precisam de aprovação da Meta.
- **Termos e condições** do primeiro acesso, incluindo o consentimento para os lembretes: texto a escrever, de preferência com orientação jurídica (LGPD).
- **Leitura de documentos (GOR-17, GOR-18):**
  - provedor do modelo de visão, chave de API e **quem paga**, com limite de leituras por rolê;
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
