import http from 'node:http';
import { createPool } from './db.js';
import { authorize, correlationId, readJson, sendJson } from './http.js';
import { companySnapshot, ensureOwner, health, submitCommand } from './repository.js';
import { loadConfig } from './config.js';

const config = loadConfig('api');
const pool = createPool(config);
const ownerId = await ensureOwner(pool, config.authSubject);
const allowedCommands = new Set(['wake','owner_message','pause','resume']);

const server = http.createServer(async (request, response) => {
  const requestId = correlationId(request);
  try {
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/api/v1/health') {
      const database = await health(pool);
      return sendJson(response, 200, { ok: database, database: database ? 'up' : 'down', version: '0.2.0' });
    }
    authorize(request, config);
    const snapshotMatch = url.pathname.match(/^\/api\/v1\/companies\/([0-9a-f-]+)\/snapshot$/i);
    if (request.method === 'GET' && snapshotMatch) {
      const snapshot = await companySnapshot(pool, ownerId, snapshotMatch[1]);
      if (!snapshot) return sendJson(response, 404, { code: 'not_found', message: 'Empresa não encontrada', correlationId: requestId });
      const etag = `\"company-${snapshotMatch[1]}-v${snapshot.stateVersion}\"`;
      if (request.headers['if-none-match'] === etag) return response.writeHead(304, { etag }).end();
      return sendJson(response, 200, snapshot, { etag });
    }
    const commandMatch = url.pathname.match(/^\/api\/v1\/companies\/([0-9a-f-]+)\/commands$/i);
    if (request.method === 'POST' && commandMatch) {
      const idempotencyKey = request.headers['idempotency-key'];
      if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 16) {
        return sendJson(response, 400, { code: 'idempotency_required', message: 'Idempotency-Key inválida', correlationId: requestId });
      }
      const body = await readJson(request);
      if (!allowedCommands.has(body.type) || !Number.isInteger(body.expectedVersion)) {
        return sendJson(response, 400, { code: 'invalid_command', message: 'Comando ou versão inválida', correlationId: requestId });
      }
      const result = await submitCommand(pool, {
        ownerId, companyId: commandMatch[1], type: body.type,
        payload: body.payload || {}, expectedVersion: body.expectedVersion, idempotencyKey
      });
      if (result.kind === 'not_found') return sendJson(response, 404, { code: 'not_found', message: 'Empresa não encontrada', correlationId: requestId });
      if (result.kind === 'conflict') return sendJson(response, 409, { code: 'version_conflict', message: 'Estado desatualizado', correlationId: requestId });
      if (result.kind === 'duplicate') return sendJson(response, 202, { duplicate: true });
      return sendJson(response, 202, result);
    }
    return sendJson(response, 404, { code: 'not_found', message: 'Rota não encontrada', correlationId: requestId });
  } catch (error) {
    const status = error.statusCode || 500;
    if (status === 500) console.error(requestId, error);
    return sendJson(response, status, { code: status === 500 ? 'internal_error' : 'request_error', message: error.message, correlationId: requestId });
  }
});

server.listen(config.port, '0.0.0.0', () => console.log(`API AgentsEnterprise ouvindo em :${config.port}`));

async function shutdown() {
  server.close();
  await pool.end();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
