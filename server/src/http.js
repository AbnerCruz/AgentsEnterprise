import { randomUUID } from 'node:crypto';

export async function readJson(request, limit = 2_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) {
      const error = new Error('Corpo excede o limite permitido');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('JSON inválido');
    error.statusCode = 400;
    throw error;
  }
}

export function sendJson(response, statusCode, body, headers = {}) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers
  });
  response.end(JSON.stringify(body));
}

export function correlationId(request) {
  return request.headers['x-correlation-id']?.slice(0, 100) || randomUUID();
}

export function authorize(request, config) {
  const value = request.headers.authorization || '';
  const token = value.startsWith('Bearer ') ? value.slice(7) : '';
  if (!token || token.length !== config.apiToken.length || !timingSafeEqualText(token, config.apiToken)) {
    const error = new Error('Não autorizado');
    error.statusCode = 401;
    throw error;
  }
}

function timingSafeEqualText(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return cryptoSafeEqual(a, b);
}

function cryptoSafeEqual(a, b) {
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) difference |= a[i] ^ b[i];
  return difference === 0;
}
