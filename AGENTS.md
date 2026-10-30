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
