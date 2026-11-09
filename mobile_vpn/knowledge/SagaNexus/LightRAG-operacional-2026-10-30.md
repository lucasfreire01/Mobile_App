# LightRAG local operacional — 2026-10-30

Integração: `tools/local_rag.py`; cliente: `python3 tools/project_memory.py search "consulta"`.
API: `http://127.0.0.1:8768/search?q=consulta`; estado: `/health`.
Somente notas Markdown curadas deste vault são indexadas. Busca semântica nativa LightRAG em modo naive, sem geração de resposta; grafo importado dos links Obsidian reais. Limite padrão: duas notas e 1.800 caracteres. Alterações das notas atualizam o índice na próxima busca.

Inferência local: Ollama em `127.0.0.1:11435`, embeddings `qwen3-embedding:0.6b` (1024 dimensões); modelo de geração disponível `qwen2.5:1.5b`. Sem API paga. CPU, uma inferência por vez. Primeira consulta pode demorar ao carregar o modelo.

Serviços de usuário habilitados para iniciar na sessão: `saganexus-ollama.service` e `saganexus-rag.service`. Estado: `systemctl --user status saganexus-ollama saganexus-rag`. Reinício: `systemctl --user restart saganexus-ollama saganexus-rag`.
Dados/modelos/venv: `~/.local/share/saganexus-rag/`.

Verificação: consulta “trocar fornecedor VPN” retornou [[Provedores-VPN-2026-10-30]] pelo engine `lightrag-local`, com 1.800 caracteres. Quando o serviço falha, o cliente informa `fallback_reason` em vez de fingir busca semântica.

Relacionadas: [[Mapa]], [[LightRAG-modelos-locais-2026-10-30]], [[LightRAG-preparacao-2026-10-30]].
