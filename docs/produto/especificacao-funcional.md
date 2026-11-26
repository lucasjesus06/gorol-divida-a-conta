# Especificação de fluxo funcional do produto

> Texto original do produto, preservado como referência. Decisões tomadas depois estão em [`../decisoes.md`](../decisoes.md), que prevalece quando houver diferença.

## Nomes

Possibilidades em avaliação (adicionem):

- RachAê
- GoRolê
- Tontina
- …

Os nomes das funcionalidades e recursos também são provisórios e poderão ser alterados durante a definição do produto.

## Mensagens de posicionamento

Possibilidade inicial:

> “Você curte, a gente acerta.”

## Conceito central

Divisão de custos em ocasiões sociais diversas, para facilitar a gestão dos gastos de um grupo, mesmo que este se reúna em ocasiões pontuais, e pagamentos.

O aplicativo também registra despesas compartilhadas entre pessoas que possuem uma relação financeira recorrente, organiza essas despesas, calcula os saldos líquidos entre os participantes e facilita os acertos entre eles.

O objetivo não é simplesmente dividir uma conta.

A aplicação deve resolver também o problema que aparece quando várias despesas são compartilhadas ao longo do tempo, diferentes pessoas pagam valores diferentes, algumas pessoas participam apenas de determinados gastos e os pagamentos começam a gerar obrigações cruzadas.

O sistema deve transformar esse histórico de despesas e pagamentos em uma visão simples:

quem pagou, quem assumiu cada despesa, quem deve, quem tem a receber e como todos podem acertar utilizando a menor quantidade possível de transferências.

Uma das ideias centrais do produto é:

**uma pessoa não precisa necessariamente pagar quem realizou o pagamento original de uma despesa.**

Se a consolidação dos saldos permitir, o sistema poderá direcionar o pagamento diretamente para outra pessoa que tenha saldo a receber, desde que o resultado financeiro final seja equivalente.

## Fluxo funcional

O usuário acessa a aplicação pela primeira vez, encontra uma apresentação simples da proposta do produto e pode começar seu uso criando uma conta. O cadastro deve exigir somente as informações necessárias para identificar e autenticar o usuário.
Após criar a conta, o usuário passa a possuir um perfil próprio dentro da aplicação.

Nesse primeiro momento, ele ainda não precisa cadastrar todos os seus amigos, conectar o banco ou configurar qualquer recurso avançado. A ideia é que o usuário consiga chegar rapidamente à primeira situação em que realmente precisa da aplicação.

Depois de criar sua conta, o usuário escolhe iniciar uma nova relação para organizar despesas compartilhadas. Essa relação poderá representar diferentes situações.

Pode ser uma relação pontual, como uma viagem, um jantar, um churrasco ou qualquer outro evento específico, ou pode representar uma relação recorrente entre pessoas que costumam compartilhar despesas.

O usuário fornece somente as informações necessárias para identificar aquela relação.

Por exemplo:

**“Viagem para Ubatuba”**

ou

**“Galera do futebol”**

ou

**“Churrasco de sábado”**

Não é necessário transformar a criação dessa relação em um formulário extenso. A data, hora e outras informações que possam ser obtidas automaticamente devem ser preenchidas pelo sistema.

Ao criar a relação, o usuário se torna inicialmente seu administrador e passa a ter a responsabilidade de organizar os participantes e administrar as despesas daquele contexto, mas ser administrador não significa ser responsável pelos pagamentos.

O administrador pode pagar uma despesa, mas qualquer participante também pode ser responsável por um pagamento.

O administrador adiciona as pessoas que participarão daquela relação. Ele pode selecionar pessoas dos contatos do aparelho ou inserir manualmente as informações necessárias, mas a aplicação não deve exigir que todos os participantes possuam uma conta.

Depois de adicionar uma pessoa, o sistema gera um convite individual que pode ser enviado por mensagem ou outro canal disponível.
A pessoa recebe um link para entrar diretamente naquela relação e o sistema realiza uma validação utilizando um código de uso único enviado ao contato associado ao convite.
O participante recebe o convite, acessa o link recebido e, em vez de ser obrigado a instalar o aplicativo e criar uma conta, pode entrar diretamente naquela relação por meio da experiência web.

Depois da validação, o participante passa a enxergar sua participação naquela relação.
A participação do usuário em uma relação pontual se encerra quando a relação for encerrada e as obrigações financeiras forem quitadas, conforme as regras definidas para aquele contexto.
Caso o usuário posteriormente queira recursos adicionais, poderá transformar sua participação em uma conta completa, dessa forma, o convite funciona como uma porta de entrada simples, enquanto a criação da conta acontece naturalmente quando houver motivo.

Uma relação também poderá estar vinculada a um grupo fixo existente.
Nesse caso, os participantes daquele grupo já possuem cadastro e fazem parte de uma relação permanente entre si. A partir desse grupo, os participantes poderão criar novas relações ou eventos temporários para registrar despesas específicas.

Essas relações temporárias poderão utilizar os participantes já existentes no grupo e também poderão receber pessoas que não pertencem ao grupo, caso elas participem apenas daquele evento.

Por exemplo, um grupo fixo formado por cinco amigos pode criar uma relação temporária para uma viagem e adicionar uma sexta pessoa que participará somente daquela viagem.
A pessoa adicionada temporariamente não precisa necessariamente passar a fazer parte do grupo fixo. Da mesma forma, uma relação criada inicialmente como temporária poderá, posteriormente, dar origem a um grupo fixo. Nesse caso, os participantes que ainda não possuírem conta deverão realizar o cadastro para que possam fazer parte do grupo fixo e utilizar os recursos permanentes associados a ele.

Depois que os participantes foram adicionados, a relação passa a funcionar como um espaço onde as despesas compartilhadas serão registradas.
A partir desse momento, qualquer situação financeira relevante pode ser adicionada e o sistema não deve assumir que existe apenas um pagador, pois uma despesa pode ser paga por uma ou várias pessoas.

Também não deve assumir que todos os participantes daquela relação participarão de todas as despesas. Cada despesa terá seus próprios participantes.

Qualquer participante poderá registrar uma despesa.
Em determinado momento, uma das pessoas paga alguma coisa para o grupo, pode ser um restaurante, um Uber, uma compra, uma viagem, uma reserva, uma conta ou qualquer outra despesa compartilhada. A pessoa registra a despesa na aplicação e o sistema deve tentar tornar esse processo o mais rápido possível.
O usuário deve informar somente o que o sistema não conseguir determinar automaticamente.
Informações como data, hora e local devem ser obtidas automaticamente.

Quando a fonte da despesa fornecer informações sobre o estabelecimento, descrição, valor ou itens, essas informações também devem ser aproveitadas.

A partir daí, a aplicação identifica quem realizou o pagamento daquela despesa.
Pode ser uma única pessoa ou duas ou mais pessoas.

Por exemplo:

Uma conta de R$ 300 pode ter sido paga integralmente por Gustavo.
Outra conta de R$ 500 pode ter sido paga por Gustavo e Hyago, com Gustavo pagando R$ 300 e Hyago pagando R$ 200.
O sistema registra esses pagamentos separadamente e determina como o valor deverá ser assumido pelos participantes da despesa.

No cenário mais simples, o usuário seleciona os participantes e escolhe uma divisão igualitária.

Por exemplo:

Uma despesa de R$ 200 foi paga por João.
Participaram João, Maria, Pedro e Lucas.
O sistema calcula R$ 50 para cada participante.

O usuário também poderá indicar que determinadas pessoas consumiram valores diferentes.

Quando existirem dados detalhados da conta, o sistema poderá apresentar os itens e seus valores, utilizando as informações que já tiverem sido identificadas.
Cada participante informa apenas aquilo que o sistema não consegue saber sozinho: quais itens consumiu ou compartilhou.

Por exemplo:

Aghata seleciona duas cervejas.

Lucas Branco seleciona uma cerveja e uma porção compartilhada com Lucas Preto.
O sistema utiliza os valores já conhecidos para calcular automaticamente quanto cada pessoa deve assumir.
Depois que o pagamento e o rateio são definidos, a despesa é registrada no histórico da relação.

Cada despesa deverá manter, além das informações financeiras, os dados necessários para identificar sua origem e permitir auditoria.

Por exemplo:

**Registrada por:** João
**Paga por:** Maria

Além de data, horário e outras informações relevantes.

O sistema atualiza automaticamente a posição financeira de todos os participantes envolvidos.
Uma pessoa que pagou mais do que deveria assumir passa a possuir valor a receber.
Uma pessoa que deveria assumir mais do que pagou passa a possuir valor a pagar.
O valor devido não é tratado como uma informação isolada, passa a fazer parte do saldo consolidado daquela relação e, à medida que surgem novas despesas, os valores vão sendo acumulados e os saldos são recalculados automaticamente, assim, depois de várias despesas, uma pessoa pode estar devendo dinheiro para outra.
Ao mesmo tempo, essa segunda pessoa pode estar devendo dinheiro para uma terceira, e também pode existir alguém que esteja com valores a receber de várias pessoas.
O usuário não precisa acompanhar manualmente essas relações, mas sim, a aplicação consolida todas as despesas e pagamentos existentes e calcula a posição líquida de cada participante.
Quando o usuário quiser acertar sua posição, a aplicação analisa os saldos existentes.

Em vez de simplesmente apresentar cada dívida originada em cada despesa, ela procura uma forma equivalente de liquidar a situação com menos transferências.

Por exemplo:
Gustavo deve R$ 40 para Karina.
Karina deve R$ 40 para Aghata.
Em vez de Gustavo pagar Karina e depois Karina pagar Aghata, a aplicação pode determinar:
Gustavo paga R$ 40 diretamente para Aghata, Karina fica neutralizada e o histórico das despesas continua intacto. O que mudou foi apenas a forma de realizar a liquidação.

A qualquer momento, o usuário pode abrir a relação e visualizar sua situação atual.
Quando decidir acertar suas obrigações, o usuário entra na área de acertos.

O sistema apresenta de forma simples:

- quanto o usuário precisa pagar;
- para quem deve pagar;
- qual meio de pagamento pode utilizar;
- quanto permanecerá pendente depois de cada pagamento.

A aplicação não precisa necessariamente movimentar o dinheiro diretamente.
No início, o Pix pode ser utilizado como principal mecanismo de pagamento, o sistema pode apresentar a chave Pix, QR Code ou outros dados necessários para que o usuário realize a transferência.

No futuro, poderão ser integradas carteiras digitais, provedores de pagamento, Open Finance e outras formas de pagamento.
O usuário pode não conseguir ou não querer quitar toda a obrigação de uma vez. Nesse caso, ele realiza um pagamento parcial.

Se devia R$ 100 e pagou R$ 40, o sistema registra:

**Devido originalmente: R$ 100**
**Pago: R$ 40**
**Pendente: R$ 60**

O pagamento reduz a obrigação existente sem alterar a despesa ou o rateio original.

O participante que possui valor a receber poderá acompanhar os pagamentos destinados a ele e poderá possuir uma conta completa para cadastrar previamente seus dados de recebimento.

Isso permite que o restante do grupo continue utilizando a solução sem conta completa, enquanto o beneficiário recebe recursos adicionais para facilitar os acertos.
Quando uma relação pontual chegar a saldo zero e não houver mais obrigações pendentes, ela poderá ser encerrada pelo administrador.

Caso os participantes tenham interesse em continuar utilizando a aplicação de forma recorrente, essa relação poderá dar origem a um grupo fixo.
Quando uma relação for criada a partir de um grupo fixo, ela poderá utilizar os participantes permanentes daquele grupo e também permitir a inclusão temporária de outras pessoas.
Por exemplo, um grupo fixo de amigos pode criar uma relação para uma viagem e adicionar temporariamente uma pessoa que não faz parte do grupo.
Essa pessoa participa apenas daquela relação e não precisa necessariamente ser incorporada ao grupo permanente.
No sentido contrário, uma relação originalmente temporária também poderá evoluir para um grupo fixo.

Nesse caso, os participantes que não possuírem conta deverão criar seus cadastros para que possam fazer parte do grupo e continuar utilizando seus recursos permanentes.
Uma relação ou grupo poderá continuar acumulando novas despesas ao longo do tempo.
Um saldo positivo ou negativo de um participante poderá diminuir, aumentar ou desaparecer conforme novas despesas e pagamentos forem registrados.

Assim, a aplicação deixa de ser apenas uma ferramenta para uma conta específica e passa a funcionar como um histórico contínuo da relação financeira entre aquelas pessoas.

## Recursos de grupo

A aplicação também poderá mostrar informações como quem mais adiantou valores para o grupo.
Uma pessoa pode ter consumido R$ 100, mas ter desembolsado R$ 500 para despesas compartilhadas.
Nesse caso, o sistema deve deixar claro que ela adiantou R$ 400 para os demais participantes.
Dentro de um grupo fixo, o usuário também deverá conseguir visualizar e acessar as diferentes relações ou eventos criados ao longo do tempo, mantendo o histórico das despesas associado ao contexto em que ocorreram.
Uma nova relação poderá ser criada a partir de um grupo existente.
Nessa nova relação, os participantes do grupo poderão ser selecionados automaticamente, e novas pessoas poderão ser adicionadas temporariamente sem que precisem necessariamente ingressar no grupo fixo.
A relação poderá evoluir com o tempo.
Novos participantes poderão ser convidados.
Participantes poderão deixar de fazer parte da relação, respeitando as regras que forem definidas para a existência de despesas e saldos pendentes.
Essas alterações não devem apagar o histórico financeiro já registrado.
O sistema deverá preservar a origem das despesas e dos pagamentos mesmo quando a composição atual da relação for diferente.

## Recursos que dependem de uma conta

O uso básico da relação deve continuar acessível sem que todos os participantes possuam uma conta.
A criação de uma conta passa a ser interessante principalmente para quem utiliza a aplicação com frequência ou para quem possui valores a receber.

Com uma conta, o usuário poderá futuramente:

- manter um histórico de diferentes relações;
- acompanhar diferentes grupos;
- cadastrar dados de recebimento;
- receber notificações;
- ter uma visão consolidada de sua posição financeira;
- conectar instituições financeiras;
- identificar automaticamente determinadas despesas;
- utilizar carteiras digitais;
- utilizar novas formas de pagamento.

A conta, portanto, deve representar uma evolução da experiência, e não uma barreira inicial.

Para participar de um grupo fixo, entretanto, todos os participantes permanentes deverão possuir cadastro.
A participação temporária em uma relação vinculada a esse grupo poderá continuar sendo feita sem a criação de uma conta, conforme as regras definidas para os convites.
