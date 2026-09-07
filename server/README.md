# Servidor — etapa de fundação

Esta pasta inicia a migração do motor local para uma autoridade durável. A primeira entrega contém a arquitetura e o schema PostgreSQL; ela ainda não substitui o motor do navegador.

## Subir o banco de desenvolvimento

```sh
docker compose -f server/docker-compose.yml up -d
docker compose -f server/docker-compose.yml exec -T postgres \
  psql -U agents -d agents_enterprise < server/db/001_initial.sql
```

## Regras de implementação

- API e worker são processos separados.
- Toda mutação exige usuário e empresa autorizados.
- Jobs usam idempotência, lease e `FOR UPDATE SKIP LOCKED`.
- Segredos entram por secret manager/variáveis de ambiente e nunca são devolvidos ao cliente.
- Valores monetários usam inteiros na menor unidade (`minor`) ou milionésimos de dólar (`microusd`); nunca `float`.
- Webhooks guardam o ID externo antes de produzir efeitos.
- Artefatos e produtos são content-addressed por SHA-256.
- Nenhuma publicação, venda ou ação bancária é simulada.

O próximo incremento implementará health, autenticação, importação do snapshot local, streaming de eventos e claim de jobs contra este schema.
