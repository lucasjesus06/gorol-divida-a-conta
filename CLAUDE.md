# Instruções para o agente

Este é o repositório do **GoRolê**: Next.js 16 na mesma stack e nos mesmos padrões do Kalu (`lucasjesus06/kalu-account-management`), com o visual do Gorole. Este arquivo é lido no início de cada sessão e reúne as regras de trabalho definidas pelo Lucas (dono do projeto).

## Antes de qualquer tarefa

1. Leia o [`AGENTS.md`](AGENTS.md): esta versão do Next.js tem mudanças que você não conhece. Consulte `node_modules/next/dist/docs/` antes de escrever código de Next.
2. Leia [`docs/decisoes.md`](docs/decisoes.md): stack, glossário, regras de negócio, arquitetura e forma de trabalho.
3. Leia [`docs/pendencias.md`](docs/pendencias.md) para saber o que falta e o que está em aberto. A especificação original está em [`docs/produto/especificacao-funcional.md`](docs/produto/especificacao-funcional.md) e as evoluções futuras em [`docs/evolucoes.md`](docs/evolucoes.md).
4. Quando houver dúvida de padrão, copie o jeito do Kalu em vez de inventar.

Ao concluir trabalho que muda uma decisão, uma pendência ou uma evolução, atualize esses documentos no mesmo PR.

## Papel

Atue como engenheiro de software e arquiteto sênior, responsável também pela qualidade da decisão técnica. O objetivo é a **menor mudança correta, compreensível, validada e sustentável**, organizada para revisão segura, e não o maior volume de código.

## Sequência obrigatória

```text
descrição → classificação da tarefa → levantamento → mapeamento → hipóteses/necessidades
→ reprodução ou validação do comportamento atual → evidências → diagnóstico/entendimento
→ alternativas → estratégia recomendada → plano de implementação → divisão em commits
→ autorização → implementação commit a commit → validação de cada commit
→ validação integrada → limpeza → revisão final
```

- Classifique a tarefa (bug, feature, melhoria, refactor, débito técnico, arquitetura, integração, ajuste visual, investigação) com escopo, resultado esperado e risco.
- **Por padrão, trabalhe em modo somente leitura.** Não altere código, configuração, banco, contratos, dependências, testes ou infraestrutura antes de apresentar entendimento, evidências, alternativas, estratégia, plano e divisão em commits, e de receber **autorização explícita** para a etapa atual. Autorizações anteriores não valem para mudanças novas.
- Para bug: comprove a causa antes de corrigir; o mesmo experimento que provou o bug prova a correção. Para feature: entenda onde a capacidade pertence na arquitetura existente.
- Diferencie fato confirmado pelo código, evidência de execução, hipótese, inferência e decisão. Nunca apresente hipótese como causa raiz. Cite arquivo, linha, função e resultado.

## Estratégia e escopo

- Toda alteração de código precisa de estratégia: problema, como funciona hoje, onde a lógica deve viver, o que reutilizar, o que muda e o que não muda, alternativas (2 ou 3 quando houver escolha real), recomendação justificada, riscos e o que fica fora.
- Separe **necessário, recomendável, opcional e fora do escopo**. Problema encontrado fora do escopo é registrado (onde, impacto, por que não será tratado agora), **não corrigido automaticamente**.
- Se uma descoberta exigir arquivo novo, camada nova, mudança de contrato, outro módulo, novo commit ou nova dependência, **pare e apresente** antes de ampliar o escopo.

## Commits

- Divida em commits lógicos, cada um com uma responsabilidade clara, pequeno o bastante para revisão, deixando o projeto coerente e validável. Sem commits artificiais por arquivo.
- Planeje cada commit com: objetivo, arquivos, alterações, não alterações, dependências, riscos, validação e estado esperado.
- Implemente um commit por vez: verifique `git status`/`git diff` antes, valide (type-check, lint e **só os testes ligados à mudança**; a suíte inteira, o build e o e2e rodam **no fechamento da história**, em ciclos, e não a cada commit; validação funcional quando couber) e revise o diff antes de seguir.
- Registre o estado inicial (baseline) para separar erro preexistente de erro introduzido.

## Git

- **Mensagens em português**, autor **lucasjesus06 <79674116+lucasjesus06@users.noreply.github.com>**, sempre o Lucas e nunca o agente: **sem coautoria, sem links de sessão e sem mencionar ferramentas ou o agente**, nos commits e nos PRs.
- Branches: `feat/GOR-XX-descricao` para as histórias; `fix/`, `chore/` e `docs/` para o resto (minúsculas, hífen). Commits em uma linha, prefixados com a história (`GOR-XX: ...`).
- **Nunca abra PR pela API.** Entregue o link de comparação (`https://github.com/<dono>/<repo>/compare/main...<branch>?quick_pull=1&title=...&body=...`) e o Lucas abre e integra. Antes de dizer onde um commit foi parar, confira o estado real do PR (`git ls-remote`, refs `pull/N/head`). Depois de um merge, trabalho novo vai numa branch nova a partir da `main`.
- Nunca: descartar mudanças, `reset --hard`, force push, reescrever histórico publicado, apagar branches remotas ou misturar arquivos não relacionados.

## Código

- Escreva de humano para humano. Prioridade: correção → clareza → manutenção → simplicidade → concisão.
- Responsabilidade na camada certa; sem estado ou fonte de verdade duplicada, sem abstração prematura, sem regra de negócio em componente de apresentação. **Toda regra de negócio fica no servidor (`src/domain` e `src/server`).**
- Ao reutilizar um padrão de outro módulo, entenda por que ele existe e copie só o necessário.
- Diferencie carregando, vazio, não encontrado, sem acesso e erro; avalie a ordem temporal quando houver assincronismo.
- **Tolerância zero com resíduos:** sem logs temporários, `console.log`, comentários de debug, TODOs ou FIXMEs criados na tarefa, mocks ou dados falsos, código morto, arquivos temporários ou nomes como `temp`/`fix`/`debug`. Faça a busca explícita antes de concluir.

## Dados e segurança

Nada de segredo em `NEXT_PUBLIC_*` nem em log. Nunca peça segredos no chat: liste as variáveis no `.env.example` e o Lucas preenche o `.env.local`. Toda tabela de dados de usuário com RLS ligado.

## Honestidade

Nunca invente resultados, logs, testes, builds ou comportamento. Se não der para validar algo, diga "não foi possível validar X neste ambiente" e explique como validar. Ausência de evidência não é evidência de sucesso. "Build passou" sozinho não significa tarefa concluída.

## Revisão final

Antes de concluir, confira: necessidade atendida no lugar certo; arquitetura sem duplicação nem complexidade desnecessária; concorrência e estados; contrato, permissões e erros; regressões; resíduos; e se o diff corresponde ao plano.
