# GoRolê: Divida a Conta

Aja como um engenheiro de software especialista em front-end e UX. Estou enviando uma imagem de referência de interface. Analise cuidadosamente a estética da imagem anexada (paleta de cores, tipografia, arredondamento de bordas, espaçamentos, estilo de botões e inputs, uso de sombras e elementos visuais) e replique exatamente essa mesma identidade visual e qualidade de design premium na aplicação que vamos construir abaixo.

Crie o front-end completo de um Web App (responsivo, focado em mobile) para um serviço brasileiro de divisão de contas de bar/restaurante chamado "GoRolê". A proposta de valor central é puxar os itens consumidos diretamente da Nota Fiscal via SEFAZ e permitir que os amigos rachem por item de forma fluida, SEM a necessidade de os convidados baixarem o aplicativo.

Fluxo do Usuário e Telas Principais que devem ser simuladas funcionalmente (com dados mockados realistas):

1. TELA INICIAL (O Dono do Rolê)

- Tela limpa com um botão central de destaque: "Iniciar Novo Rolê".

- Ao clicar, simular a ativação da câmera ou upload de imagem com o texto: "Aponte para o QR Code da Notinha Fiscal (NFC-e/SAT)".

- [Simulação de Processamento]: Adicione um loading fofo/divertido enquanto o app "extrai a chave de acesso de 44 dígitos e consulta a SEFAZ".

2. TELA DO ROLÊ ATIVO (Visão do Administrador)

- Exibir a lista real de itens que veio da nota fiscal (Ex: "Chopp Brahma 300ml - R$ 12,00", "Picanha na Chapa - R$ 89,00", "Água Sem Gás - R$ 6,00") e a Taxa de Serviço (10% ou 13%) calculada proporcionalmente por item.

- Botão visível para o dono do rolê: "Compartilhar com os amigos". Ao clicar, simular a geração de um link único (Ex: gorole.com.br/mesa-da-resenha) para mandar no WhatsApp.

3. VISÃO DO CONVIDADO (O link que abre no navegador do celular, sem login obrigatório)

- O amigo abre o link, digita apenas o seu primeiro nome para entrar na mesa digital.

- Interface estilo "arrastar" ou "clicar para selecionar" os itens da lista que ele consumiu. Se mais de uma pessoa tomou o mesmo chopp, deve permitir dividir a quantidade daquele item específico.

- O sistema calcula em tempo real o subtotal do amigo + a taxa de serviço correspondente estritamente ao que ele consumiu.

4. SISTEMA DE COBRANÇA E CONFIRMAÇÃO VIA PIX (Sem atrito)

- Quando o convidado clica em "Pagar Minha Parte", o app exibe uma tela com um código "Pix Copia e Cola" dinâmico gerado com o valor exato.

- [Simulação de Webhook]: Adicione um botão "Simular Pagamento Bancário" (apenas para testar o fluxo no protótipo). 

- Assim que o pagamento é simulado, a tela do app atualiza sozinha via webhook e lê o payload do banco mostrando um pop-up inteligente: "Recebemos um Pix de R$ [Valor] vindo de [NOME COMPLETO DO PAGADOR]. Foi você mesmo?". Com duas opções:

  * Botão A: "Sim, fui eu!" (Associa o pagamento ao nome digitado no início).

  * Botão B: "Não, paguei para outra pessoa" (Abre a lista de amigos da mesa para o usuário selecionar quem ele está quitando).

Diretrizes de UI/UX adicionais:

- O tom de voz do app deve ser descontraído, focado na "resenha do bar" e não em finanças corporativas frias.

- Use animações suaves nas transições de seleção de itens e confirmação de pagamentos.

- Lembre-se de seguir rigorosamente a estética visual da imagem anexa.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/0ceb19a2-e05c-4a63-90eb-cd4b6b38df6f).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
