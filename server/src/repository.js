import { transaction } from './db.js';

export async function ensureOwner(pool, authSubject) {
  const result = await pool.query(
    `INSERT INTO app_user(auth_subject) VALUES ($1)
     ON CONFLICT (auth_subject) DO UPDATE SET auth_subject = EXCLUDED.auth_subject
     RETURNING id`,
    [authSubject]
  );
  return result.rows[0].id;
}

export async function health(pool) {
  const result = await pool.query('SELECT 1 AS ok');
  return result.rows[0]?.ok === 1;
}

export async function companySnapshot(pool, ownerId, companyId) {
  const company = await pool.query(
    'SELECT * FROM company WHERE id = $1 AND owner_id = $2',
    [companyId, ownerId]
  );
  if (!company.rowCount) return null;
  const [agents, projects, tasks, artifacts, meetings, budget, workforce] = await Promise.all([
    pool.query('SELECT * FROM agent WHERE company_id = $1 AND dismissed_at IS NULL ORDER BY sector,is_sector_lead DESC,name', [companyId]),
    pool.query('SELECT * FROM project WHERE company_id = $1 ORDER BY created_at', [companyId]),
    pool.query(`SELECT t.* FROM task t JOIN project p ON p.id=t.project_id WHERE p.company_id=$1 ORDER BY t.priority DESC,t.created_at`, [companyId]),
    pool.query(`SELECT a.* FROM artifact a JOIN project p ON p.id=a.project_id WHERE p.company_id=$1 ORDER BY a.created_at DESC`, [companyId]),
    pool.query('SELECT * FROM meeting_entry WHERE company_id = $1 ORDER BY created_at', [companyId]),
    pool.query(`SELECT
      c.budget_value_microusd AS allocated_microusd,
      COALESCE(SUM(CASE WHEN l.kind='ai_cost' THEN ABS(l.amount_microusd) ELSE 0 END),0)::bigint AS spent_microusd
      FROM company c LEFT JOIN ledger_entry l ON l.company_id=c.id WHERE c.id=$1 GROUP BY c.id`, [companyId]),
    pool.query('SELECT * FROM workforce_capacity WHERE company_id=$1 ORDER BY sector', [companyId])
  ]);
  const allocation = BigInt(budget.rows[0]?.allocated_microusd || 0);
  const spent = BigInt(budget.rows[0]?.spent_microusd || 0);
  return {
    stateVersion: Number(company.rows[0].state_version),
    company: company.rows[0], agents: agents.rows, projects: projects.rows,
    tasks: tasks.rows, artifacts: artifacts.rows, meetings: meetings.rows,
    workforce: workforce.rows,
    budget: {
      allocatedMicrousd: allocation.toString(),
      spentMicrousd: spent.toString(),
      remainingMicrousd: (allocation - spent).toString()
    }
  };
}

export async function submitCommand(pool, { ownerId, companyId, type, payload, expectedVersion, idempotencyKey }) {
  return transaction(pool, async client => {
    const company = await client.query(
      'SELECT state_version FROM company WHERE id=$1 AND owner_id=$2 FOR UPDATE',
      [companyId, ownerId]
    );
    if (!company.rowCount) return { kind: 'not_found' };
    if (Number(company.rows[0].state_version) !== expectedVersion) return { kind: 'conflict' };
    const inserted = await client.query(
      `INSERT INTO job(company_id,kind,payload,idempotency_key)
       VALUES($1,'company_command',$2,$3)
       ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`,
      [companyId, JSON.stringify({ type, payload }), idempotencyKey]
    );
    if (!inserted.rowCount) return { kind: 'duplicate' };
    const version = await client.query(
      'UPDATE company SET state_version=state_version+1,updated_at=now() WHERE id=$1 RETURNING state_version',
      [companyId]
    );
    return { kind: 'accepted', jobId: inserted.rows[0].id, stateVersion: Number(version.rows[0].state_version) };
  });
}

export async function claimJob(pool, workerId, leaseSeconds) {
  return transaction(pool, async client => {
    const result = await client.query(
      `WITH candidate AS (
         SELECT id FROM job
         WHERE (status='queued' OR (status='leased' AND lease_until < now())) AND available_at <= now()
         ORDER BY available_at,created_at FOR UPDATE SKIP LOCKED LIMIT 1
       )
       UPDATE job j SET status='leased',lease_owner=$1,
         lease_until=now()+make_interval(secs=>$2),attempts=attempts+1
       FROM candidate c WHERE j.id=c.id RETURNING j.*`,
      [workerId, leaseSeconds]
    );
    return result.rows[0] || null;
  });
}

export async function finishJob(pool, jobId, workerId) {
  await pool.query(
    `UPDATE job SET status='succeeded',completed_at=now(),lease_until=NULL
     WHERE id=$1 AND lease_owner=$2 AND status='leased'`,
    [jobId, workerId]
  );
}

export async function failJob(pool, job, workerId, error) {
  const terminal = Number(job.attempts) >= Number(job.max_attempts);
  await pool.query(
    `UPDATE job SET status=$3,available_at=now()+make_interval(secs=>LEAST(900,POWER(2,attempts)::int)),
       lease_until=NULL,last_error=$4
     WHERE id=$1 AND lease_owner=$2 AND status='leased'`,
    [job.id, workerId, terminal ? 'dead' : 'queued', String(error?.message || error).slice(0, 2000)]
  );
}

export async function scheduleCompany(pool, companyId, workerId, leaseSeconds) {
  const result = await pool.query('SELECT * FROM schedule_company_tasks($1,$2,$3)', [companyId, workerId, leaseSeconds]);
  return result.rows;
}

export async function enqueueSchedule(pool, companyId, sourceKey) {
  await pool.query(
    `INSERT INTO job(company_id,kind,payload,idempotency_key)
     VALUES($1,'schedule_company','{}'::jsonb,$2) ON CONFLICT (idempotency_key) DO NOTHING`,
    [companyId, `schedule:${companyId}:${sourceKey}`]
  );
}
