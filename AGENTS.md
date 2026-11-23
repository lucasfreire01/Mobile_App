# Contexto econômico do SagaNexus

Antes de explorar o repositório, leia `knowledge/SagaNexus/Mapa.md`.
Busque o assunto com `python3 tools/project_memory.py search "consulta"` ou pela
API local `/search` quando estiver ativa. Abra apenas as notas e os trechos de
código apontados, respeitando também os AGENTS.md específicos das subpastas.

- Não reler arquivos completos quando `rg -n` e um trecho resolvem.
- Não carregar todas as notas ou skills por rotina.
- Limitar a busca inicial a 2 notas / 1.800 caracteres; ampliar apenas se necessário.
- Registrar decisões e mudanças relevantes em notas curtas do vault após concluir trabalho.
- As notas são um índice datado: verificar fatos de runtime e código antes de decisões críticas.
- Preservar alterações locais; não indexar segredos nem logs brutos.
- Não repetir testes sem mudança, falha ou incerteza que justifique.

Vault Obsidian: `knowledge/SagaNexus/`. LightRAG local ativo em http://127.0.0.1:8768, com embeddings locais via Ollama.
A ferramenta usa fallback lexical explícito se o serviço estiver indisponível.

## Skills recomendadas (carregar sob demanda)

Skills instaladas não ficam automaticamente ativas. Consultar e carregar apenas a skill adequada à tarefa, sem ler o catálogo inteiro:

- **Contexto econômico:** RTK (`rtk`, instalado localmente v1.2.0) para reduzir a saída de comandos compatíveis; usar o comando original se a saída compactada omitir evidência necessária. `context-minimizer` para resumir/handoff e reduzir contexto; `codebase-context-retrieval` para localizar fluxo, chamadas e arquivos relevantes sem varrer o repo.
- **Código:** `ponytail` em implementação, correção e escolha de dependências, priorizando a menor solução correta; `ponytail-review` em revisão/refatoração para procurar complexidade desnecessária; `implementation-review` quando pedirem revisão explícita de correção, desempenho, manutenção e segurança.
- **Segurança:** `security-best-practices` para orientação ou revisão secure-by-default em TypeScript/JavaScript; `security-threat-model` quando pedirem modelagem de ameaças; `conducting-api-security-testing` ou `testing-api-security-with-owasp-top-10` para testes autorizados das APIs; `conducting-mobile-app-penetration-test`, `testing-mobile-api-authentication` ou `exploiting-insecure-data-storage-in-mobile` para avaliações autorizadas do app e armazenamento móvel. Não executar testes ofensivos fora de escopo autorizado.
- **UI/UX:** `frontend-design-codex` para criar ou alterar interfaces com verificação visual; `impeccable` para auditoria/redesign aprofundado de UI, quando a tarefa envolver identidade visual e experiência do produto.

As skills acima são candidatas prioritárias, não uma lista exaustiva das 800+ skills de segurança disponíveis. Usar as skills especializadas restantes somente quando o produto, tecnologia e objetivo corresponderem claramente ao gatilho descrito por elas.


## Fluxo obrigatório com multiagentes

- Ao receber um pedido de alteração, coordenar os subagentes para que compartilhem contexto, plano, implementação e achados de validação entre si. Concluir o trabalho autorizado de ponta a ponta e retornar ao usuário somente quando estiver pronto, sem interromper com atualizações de rotina ou pedidos de aprovação dentro do escopo autorizado.
- Usar agentes distintos para quatro papéis: planejador, implementador, testador e segundo testador independente.
- O planejador define solução mínima, arquivos previstos, critérios de aceite e verificações necessárias. O implementador executa esse plano e corrige falhas apontadas.
- O primeiro testador verifica comportamento e regressões. O segundo avalia independentemente os critérios de aceite, casos de falha e lacunas da primeira validação.
- Cada testador informa o que verificou, evidências, resultado e pendências. Reprovações voltam ao implementador; alterações corretivas são revalidadas pelos testadores conforme o comportamento afetado.
- O coordenador distribui tarefas e apresenta os resultados, sem substituir as validações independentes. O implementador não aprova o próprio trabalho.
- Executar os quatro papéis em fases quando necessário, respeitando os slots disponíveis. Delegar não amplia o escopo nem os limites de operações por etapa.
- Não pedir confirmações rotineiras entre os papéis dentro do escopo já autorizado. Continuam valendo as autorizações e os limites descritos neste arquivo.
- Para mudanças somente documentais, os dois testadores verificam texto, coerência e preservação das regras existentes, sem build, lint ou testes de produto.

## Controle de consumo e escopo

- Padrão: execução econômica. Antes de agir, declarar em uma frase a etapa concreta e seus limites.
- Cada etapa deve ter no máximo 8 operações de ferramenta. Contar operações internas de chamadas agrupadas; não agrupar comandos para contornar o limite.
- Se o trabalho exigir mais, apresentar o resultado parcial, o que falta e a próxima etapa; aguardar o usuário antes de ampliar. Reservar operações para concluir ou desfazer com segurança mudanças já iniciadas.
- Antes de uma implementação que envolva mais de 3 arquivos de produto, ou uma mudança arquitetural, apresentar a lista prevista de arquivos e dividir em etapas curtas. Aguardar a escolha do usuário sobre a primeira etapa; não interpretar uma escolha de objetivo como aprovação de uma implementação extensa.
- Não ampliar uma tarefa pequena com refatoração, funcionalidades adjacentes, migrações ou documentação extensa. Incluir somente o necessário ao objetivo explicitamente combinado.
- Não reler conteúdo já disponível no contexto. Usar rg e trechos pequenos; não varrer logs, histórico ou diretórios amplos por rotina.
- Executar a verificação pertinente uma vez. Repetir apenas após mudança que a afete, falha concreta ou incerteza identificada; informar o motivo. Não repetir a suíte completa a cada ajuste intermediário.
- Resumir saídas antes de trazê-las ao contexto. Não despejar auditorias JSON, árvores de dependências ou logs completos.
- Para alterações apenas documentais, não rodar build, lint ou testes.
- Esses limites são regras de execução, não medição de tokens. Não prometer porcentagens de consumo nem afirmar que existe bloqueio técnico quando ele não estiver configurado.


## Testes e registro obrigatórios

- Para cada alteração de código, criar ou atualizar e executar testes unitários ou de regressão que cubram o comportamento modificado antes de concluir. Se não for viável, explicar o motivo e o limite da validação; nunca afirmar que passou sem evidência.
- Ao concluir uma mudança de código, registrar em nota curta no vault os arquivos ou fluxo alterados, o comando de teste executado e o resultado. Não copiar logs brutos nem segredos.
