# Mapa e recuperação de contexto

Vault Obsidian: `knowledge/SagaNexus/`. No Obsidian, use **Abrir pasta como vault**
e selecione essa pasta. Abra `Mapa.md`; os links entre as seis notas formam o grafo.
Não foi localizada uma instalação/vault anterior do Obsidian neste ambiente.

Busca sem modelo, disponível agora:

```bash
python3 tools/project_memory.py search "reserva IP"
python3 tools/project_memory.py serve --port 8767
```

API: `GET http://127.0.0.1:8767/search?q=reserva+IP`.
Retorna até 2 notas e 1.800 caracteres por padrão; limite absoluto de 3 notas e
3.000 caracteres de conteúdo. Só lê Markdown curado deste vault, sem seguir
symlinks. Não indexa código, arquivos de ambiente, chaves, bancos ou logs.

`AGENTS.md` na raiz orienta os agentes a consultar esse mapa antes de explorar
o projeto. A CLI funciona mesmo se o servidor estiver desligado. Esta busca é
lexical; **não é LightRAG** e não oferece busca semântica ou embeddings.

LightRAG oficial identificado: https://github.com/HKUDS/LightRAG.
Instalação/indexação pendentes de viabilidade de espaço e escolha de modelo.
Não foi configurado provedor pago nem iniciado download de modelos locais.
O ambiente isolado reservado está em `.tools/lightrag/.venv/` e é ignorado pelo Git.

As notas contêm decisões e caminhos, não cópias do repositório. Atualize só a nota
afetada quando houver mudança relevante. Para executar uma alteração, confirme
no trecho de código ou evidência indicado; a nota sozinha não prova estado atual.
