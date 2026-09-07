# Servidor — runtime inicial

Esta pasta contém a API autoritativa inicial, PostgreSQL e um worker durável. O navegador ainda não foi migrado e o executor de IA ainda não está conectado; portanto este runtime não deve substituir a versão local em produção nesta etapa.

## Subir o banco de desenvolvimento

```sh
export POSTGRES_PASSWORD='troque-esta-senha'
export SERVER_API_TOKEN='gere-um-segredo-longo-e-aleatorio'
docker compose -f server/docker-compose.yml up --build -d
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
- O escalonador mantém a especialização por setor, ocupa colaboradores antes do chefe e só usa o chefe como produtor quando sobra demanda.
- A visão `workforce_capacity` expõe excesso e falta de capacidade por setor para decisões financeiras de contratação, transferência ou desligamento.

## Implementado neste corte

- `GET /api/v1/health`;
- snapshot autorizado com versão e `ETag`;
- comandos duráveis `wake`, `owner_message`, `pause` e `resume` com idempotência;
- claim concorrente de jobs e tarefas com lease e `SKIP LOCKED`;
- distribuição justa por setor e medição explícita de capacidade ociosa.

O próximo incremento conecta o executor de IA, importa o snapshot local uma única vez e transmite eventos ao jogo. Até isso acontecer, uma tentativa de execução volta a tarefa para `open`; jamais declara trabalho fictício como concluído.
