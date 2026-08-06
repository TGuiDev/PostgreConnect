# PostgreConnect

API que centraliza conexões com múltiplos bancos PostgreSQL e os expõe como
um proxy de queries sob demanda para outro sistema consumidor. Pensada para
rodar atrás de um Cloudflare Tunnel, sem precisar abrir portas no roteador,
com deploy via Dokploy.

## Como funciona

- Cada banco Postgres "de destino" é cadastrado via API e fica salvo em um
  banco de metadados (Postgres), com a senha criptografada em repouso
  (AES-256-GCM).
- O sistema consumidor chama `POST /connections/{id}/query` com um SQL
  (e parâmetros) e a API executa a query no banco correspondente e devolve
  o resultado. Não há sincronização em background — é proxy sob demanda.
- Conexões marcadas como `readOnly: true` (padrão) só conseguem executar
  `SELECT`: a query roda dentro de uma transação `READ ONLY` do Postgres,
  então qualquer tentativa de escrita é rejeitada pelo próprio banco.
- Pools de conexão (`pg.Pool`) são criados sob demanda por banco cadastrado
  e ficam em cache; pools ociosos por mais de `POOL_IDLE_EVICT_MS` são
  fechados automaticamente.

## Autenticação

Toda rota (exceto `GET /health` e `GET /docs*`) exige o header `X-API-Key`,
validado contra a lista definida em `API_KEYS` (comma-separated) —
comparação em tempo constante para evitar timing attacks. Gere chaves fortes
com:

```bash
openssl rand -hex 32
```

## Documentação (Swagger / OpenAPI)

A API expõe documentação interativa em `GET /docs` (Swagger UI) e o spec cru
em `GET /docs/json`. Essas rotas são públicas (não exigem `X-API-Key`) para
facilitar a navegação pelo browser, mas as chamadas de "Try it out" exigem a
chave — clique em **Authorize** no topo da página e cole sua `X-API-Key`. Os
schemas são gerados automaticamente a partir da mesma validação Zod usada
nas rotas, então documentação e validação nunca ficam dessincronizadas.

## Endpoints

| Método | Rota                          | Descrição                                   |
|--------|-------------------------------|----------------------------------------------|
| GET    | `/health`                     | Health check (sem autenticação)              |
| GET    | `/docs`                       | Swagger UI (sem autenticação para visualizar) |
| GET    | `/connections`                | Lista bancos cadastrados (sem senha)         |
| GET    | `/connections/:id`            | Detalhe de um banco cadastrado               |
| POST   | `/connections`                | Cadastra um banco (testa a conexão antes de salvar) |
| PUT    | `/connections/:id`            | Atualiza um banco cadastrado                 |
| DELETE | `/connections/:id`            | Remove um banco cadastrado                   |
| POST   | `/connections/:id/test`       | Testa conectividade com o banco              |
| POST   | `/connections/:id/query`      | Executa `{ "sql": "...", "params": [...] }`  |
| GET    | `/connections/:id/tables`     | Lista tabelas do banco (`?schema=public`)    |
| GET    | `/connections/:id/tables/:table/columns` | Lista colunas de uma tabela (`?schema=public`) |

Exemplo de cadastro:

```bash
curl -X POST https://sua-api.exemplo.com/connections \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "erp-producao",
    "host": "10.0.0.5",
    "port": 5432,
    "database": "erp",
    "username": "leitura",
    "password": "senha-forte",
    "ssl": true,
    "readOnly": true
  }'
```

Exemplo de query:

```bash
curl -X POST https://sua-api.exemplo.com/connections/<id>/query \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT * FROM pedidos WHERE status = $1", "params": ["pendente"]}'
```

Exemplo de descoberta de schema (quando você não sabe quais tabelas existem):

```bash
# lista as tabelas do schema "public" (padrao)
curl -s "https://sua-api.exemplo.com/connections/<id>/tables" \
  -H "X-API-Key: $API_KEY"

# lista as colunas de uma tabela especifica
curl -s "https://sua-api.exemplo.com/connections/<id>/tables/pedidos/columns" \
  -H "X-API-Key: $API_KEY"
```

## Variáveis de ambiente

Veja [.env.example](.env.example). As obrigatórias são:

- `METADATA_DATABASE_URL` — Postgres onde ficam salvos os bancos cadastrados.
- `ENCRYPTION_KEY` — 32 bytes em hex (64 caracteres), usada para criptografar
  as senhas guardadas. Gere com `openssl rand -hex 32` e **nunca a rotacione
  sem antes exportar/recadastrar as conexões**, pois as senhas antigas ficam
  ilegíveis.
- `API_KEYS` — lista de chaves válidas, separadas por vírgula.

## Rodando localmente

```bash
cp .env.example .env
# preencha METADATA_DATABASE_URL, ENCRYPTION_KEY e API_KEYS no .env
npm install
npm run dev
```

Ou via Docker Compose (sobe também um Postgres para metadados):

```bash
export ENCRYPTION_KEY=$(openssl rand -hex 32)
export API_KEYS=$(openssl rand -hex 32)
docker compose up --build
```

## Deploy no Dokploy + Cloudflare Tunnel

1. **Suba o banco de metadados**: crie um serviço Postgres no Dokploy (ou
   use um existente) só para guardar as conexões cadastradas — ele é
   separado dos bancos que a API vai consultar.
2. **Crie a aplicação no Dokploy** apontando para este repositório (usa o
   `Dockerfile` incluso). Configure as variáveis de ambiente
   (`METADATA_DATABASE_URL`, `ENCRYPTION_KEY`, `API_KEYS`, etc.) no painel do
   Dokploy — nunca commitá-las no repositório.
3. **Não exponha a porta publicamente no Dokploy** (sem port-forward no
   roteador, como você já faz). A aplicação escuta em `PORT` (padrão 3000)
   apenas na rede interna dos containers.
4. **Configure o `cloudflared`** para apontar para o serviço interno do
   Dokploy pelo nome do container/rede (não pelo IP público). Exemplo de
   `config.yml` do túnel:

   ```yaml
   tunnel: <TUNNEL_ID>
   credentials-file: /etc/cloudflared/<TUNNEL_ID>.json

   ingress:
     - hostname: postgreconnect.seu-dominio.com
       service: http://postgreconnect-api:3000
     - service: http_status:404
   ```

   Ajuste `postgreconnect-api` para o nome real do serviço/container criado
   pelo Dokploy (visível na aba de rede/serviço da aplicação).
5. **Camada extra de proteção (recomendado)**: coloque o hostname atrás do
   Cloudflare Access (Zero Trust) além da API key, principalmente se o outro
   sistema consumidor tiver IP fixo — assim você restringe por IP/identidade
   antes mesmo de chegar na aplicação.

## Notas de segurança

- Prefira criar, em cada banco de destino, um usuário Postgres **somente
  leitura** (`GRANT SELECT`) para usar nas conexões cadastradas com
  `readOnly: true`. A trava por transação `READ ONLY` já impede escritas,
  mas ter também a restrição no papel do banco é defesa em profundidade.
- `statement_timeout` (via `QUERY_TIMEOUT_MS`) evita que uma query lenta
  prenda um slot do pool indefinidamente.
- As senhas dos bancos cadastrados são criptografadas (AES-256-GCM) antes de
  ir para o banco de metadados — nunca ficam em texto puro em disco.
