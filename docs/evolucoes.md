# Evoluções futuras

Ideias e capacidades combinadas para depois da primeira versão validada. Não fazem parte da v1. O que falta para a v1 está em [`pendencias.md`](pendencias.md).

## Acesso

- **Código de confirmação pelo WhatsApp na entrada do rolê:** ao escolher o próprio nome no link do rolê, a pessoa recebe um código no telefone cadastrado pelo dono e digita no app. Substitui a conferência do número digitado, que na v1 deixa entrar quem sabe o telefone de um amigo.
  - A mensagem é pedida pela própria pessoa (mensagem de autenticação, nas regras da Meta), então não depende de consentimento prévio.
  - Exige conta da empresa verificada na Meta e modelo de mensagem aprovado.
  - Custo por mensagem, só no primeiro acesso de cada aparelho.

## Pagamentos

- **Comprovante, opção C:** antes de confirmar automaticamente, o app lê o comprovante e confere valor, recebedor, data e o identificador único do Pix (E2E ID). Assim o mesmo comprovante não serve duas vezes. Evolução da opção B, que já está implementada.
- **Open Finance (v2):**
  - **Iniciação de pagamento:** o devedor autoriza o Pix no app do banco dele, o dinheiro vai direto para o credor (o app não toca no dinheiro) e o app recebe a confirmação oficial, sem comprovante.
  - **Leitura da conta do credor:** com o consentimento do credor, o app identifica os Pix recebidos e confirma sozinho.
  - Ambos exigem autorização do Banco Central ou um parceiro autorizado, com custo por transação.
- **Confirmação por provedor:** adicionar a origem `provider` à confirmação do pagamento quando houver integração.
- **Carteiras digitais** e outros meios de pagamento.
- **Autenticação reforçada** (segundo fator) quando o app passar a lidar com movimentação de pagamentos.

## Despesas

- **Leitura real da NFC-e:** QR Code da notinha e consulta à SEFAZ de cada estado para importar estabelecimento, valor e itens. A viabilidade por estado ainda não foi investigada.
- **Identificação automática de despesas** pela conta bancária conectada.
- **Local da despesa:** obter automaticamente pelo aparelho e transformar em endereço.

## Saldos e grupos

- **Compensação de saldos entre rolês** do mesmo grupo (na v1 cada rolê é acertado separado).
- **Visão consolidada** da posição financeira da pessoa em todos os grupos.
- **Estabilidade da rota inteligente:** manter as mesmas duplas de pagamento depois de pagamentos parciais, quando possível.

## Notificações e cobrança

- **Notificações** no app além do WhatsApp.
- Atualização das telas em tempo real (eventos enviados pelo servidor) em vez de consulta periódica.

## Mobile e frontend

- App nativo (Capacitor ou outro) e publicação nas lojas, se o PWA não bastar.

## Arquitetura

- **Microsserviços** ou serviço separado, se o volume exigir; hoje tudo roda no Next e no Postgres do Supabase.
