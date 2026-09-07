import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

test('API não expõe segredo e exige idempotência e versão', async () => {
  const api = await readFile(new URL('src/api.js', root), 'utf8');
  assert.match(api, /authorize\(request, config\)/);
  assert.match(api, /idempotency-key/);
  assert.match(api, /expectedVersion/);
  assert.doesNotMatch(api, /sendJson\([^\n]+apiToken/);
});

test('scheduler distribui aos colaboradores antes dos líderes e respeita setor', async () => {
  const sql = await readFile(new URL('db/002_scheduler.sql', root), 'utf8');
  assert.match(sql, /ORDER BY is_sector_lead ASC/);
  assert.match(sql, /t\.sector=worker\.sector/);
  assert.match(sql, /prerequisite\.status<>'done'/);
  assert.match(sql, /FOR UPDATE OF t SKIP LOCKED/);
  assert.match(sql, /CREATE VIEW workforce_capacity/);
  assert.match(sql, /surplus_capacity/);
});

test('worker não inventa execução de IA ausente', async () => {
  const worker = await readFile(new URL('src/worker.js', root), 'utf8');
  assert.match(worker, /status='open'/);
  assert.match(worker, /status='available'/);
  assert.match(worker, /Executor de IA ainda não configurado/);
  assert.doesNotMatch(worker, /status='done'/);
});

test('valores financeiros permanecem inteiros serializáveis', async () => {
  const repository = await readFile(new URL('src/repository.js', root), 'utf8');
  assert.match(repository, /BigInt/);
  assert.match(repository, /remainingMicrousd/);
  assert.doesNotMatch(repository, /parseFloat/);
});
