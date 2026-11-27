# Evoluções futuras

Ideias e capacidades combinadas para depois da primeira versão validada. Não fazem parte da v1. O que falta para a v1 está em [`pendencias.md`](pendencias.md).

## Acesso

- **Código de confirmação pelo WhatsApp na entrada do rolê:** ao escolher o próprio nome no link do rolê, a pessoa recebe um código no telefone cadastrado pelo dono e digita no app. Substitui a conferência do número digitado, que na v1 deixa entrar quem sabe o telefone de um amigo.
  - A mensagem é pedida pela própria pessoa (mensagem de autenticação, nas regras da Meta), então não depende de consentimento prévio.
  - Exige conta da empresa verificada na Meta e modelo de mensagem aprovado.
  - Custo por mensagem, só no primeiro acesso de cada aparelho.

- **Link individual por contato:** o dono escolhe o contato e o app gera um link só daquela pessoa, já dentro de uma mensagem do WhatsApp. O código do link vale como credencial, então dispensa a confirmação do telefone e a aprovação.
- **Sala com código e QR ao vivo:** código curto e QR na tela do dono, e quem chega aparece em tempo real para aprovar. Ajuda em rolê presencial, em que a presença física é a verificação.
- **Foto na aprovação:** a pessoa tira uma selfie ao entrar e o dono a vê ao aprovar. Exige a base de armazenamento (GOR-15 e GOR-20). Visível só ao dono, apagada na recusa e, na aprovação, a não ser que a pessoa a escolha como foto de perfil.
- **PIN ou passkey para o convidado voltar sozinho** em outro aparelho, sem pedir novo link ao dono, com limite de tentativas.
- **Segundo fator (TOTP ou passkey) para o super administrador**, que é o acesso mais valioso do sistema.

## Pagamentos

- **Comprovante, opção C completa:** além de verificar que é um comprovante de Pix e guardar o identificador único (já previstos na v1, ver `decisoes.md`), conferir de forma automática valor, recebedor e data contra o pagamento declarado e bloquear a confirmação quando não baterem.
- **Open Finance (v2):**
  - **Iniciação de pagamento:** o devedor autoriza o Pix no app do banco dele, o dinheiro vai direto para o credor (o app não toca no dinheiro) e o app recebe a confirmação oficial, sem comprovante.
  - **Leitura da conta do credor:** com o consentimento do credor, o app identifica os Pix recebidos e confirma sozinho.
  - Ambos exigem autorização do Banco Central ou um parceiro autorizado, com custo por transação.
- **Confirmação por provedor:** adicionar a origem `provider` à confirmação do pagamento quando houver integração.
- **Carteiras digitais** e outros meios de pagamento.
- **Autenticação reforçada** (segundo fator) quando o app passar a lidar com movimentação de pagamentos.

## Despesas

- **Leitura da NFC-e pelo QR Code:** consulta à SEFAZ de cada estado para importar estabelecimento, valor e itens sem foto. A viabilidade por estado ainda não foi investigada.
- **Documentos Word, Excel e outros** na leitura de documentos.
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
