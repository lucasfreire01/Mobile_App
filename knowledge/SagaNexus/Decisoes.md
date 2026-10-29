# Decisoes

- Preservar logo, autenticação, navegação e integrações reais do app.
- A estética pode evoluir; foco operacional mobile Android/iOS.
- Checkout contém muitas alterações anteriores: fazer diffs pontuais.
- Não ler nem indexar `.env`, tokens, chaves SSH, logs brutos ou bancos no vault/RAG.
- Não executar operações em gateways reais como teste de regressão.
- Runtime PostgreSQL restrito; migrações usam credencial separada.
- Não liberar IP de resultado remoto incerto automaticamente.
- Priorizar economia de tokens: mapa primeiro, busca curta, arquivo certo e trecho específico.
- Notas são orientação datada, não substituem código e verificação operacional atual.

O LightRAG só deve indexar estas notas curadas, não o workspace inteiro. Escolha de modelo e configuração ainda pendentes. A busca local atual não usa LightRAG nem modelo.

Ver [[Mapa]], [[Backend]], [[Testes]], [[App]].
