const required = name => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}`);
  return value;
};

const positiveInteger = (name, fallback) => {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} deve ser inteiro positivo`);
  return value;
};

export function loadConfig(role) {
  const common = {
    databaseUrl: required('DATABASE_URL'),
    databaseSsl: process.env.DATABASE_SSL === 'true',
    role
  };
  if (role === 'api') {
    return {
      ...common,
      port: positiveInteger('PORT', 8080),
      apiToken: required('SERVER_API_TOKEN'),
      authSubject: process.env.SERVER_AUTH_SUBJECT?.trim() || 'owner:local'
    };
  }
  return {
    ...common,
    workerId: process.env.WORKER_ID?.trim() || `worker-${process.pid}`,
    pollMs: positiveInteger('WORKER_POLL_MS', 1000),
    leaseSeconds: positiveInteger('WORKER_LEASE_SECONDS', 120)
  };
}
