import pg from 'pg';

const { Pool } = pg;

export function createPool(config) {
  return new Pool({
    connectionString: config.databaseUrl,
    max: config.role === 'worker' ? 4 : 10,
    ssl: config.databaseSsl ? { rejectUnauthorized: true } : false
  });
}

export async function transaction(pool, work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
