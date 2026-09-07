import { createPool } from './db.js';
import { claimJob, enqueueSchedule, failJob, finishJob, scheduleCompany } from './repository.js';
import { loadConfig } from './config.js';

const config = loadConfig('worker');
const pool = createPool(config);
let stopping = false;

while (!stopping) {
  const job = await claimJob(pool, config.workerId, config.leaseSeconds);
  if (!job) {
    await new Promise(resolve => setTimeout(resolve, config.pollMs));
    continue;
  }
  try {
    if (job.kind === 'company_command') {
      if (job.payload.type === 'pause' || job.payload.type === 'resume') {
        await pool.query(
          `UPDATE company SET status=$2,updated_at=now(),state_version=state_version+1 WHERE id=$1`,
          [job.company_id, job.payload.type === 'pause' ? 'paused' : 'active']
        );
      }
      if (job.payload.type === 'owner_message') {
        const body = String(job.payload.payload?.message || '').trim();
        if (!body) throw new Error('Mensagem do proprietário vazia');
        await pool.query(
          `INSERT INTO meeting_entry(company_id,actor_type,category,body)
           VALUES($1,'owner','owner_message',$2)`,
          [job.company_id, body.slice(0, 50000)]
        );
      }
      if (job.payload.type === 'wake' || job.payload.type === 'resume' || job.payload.type === 'owner_message') {
        await enqueueSchedule(pool, job.company_id, job.id);
      }
    } else if (job.kind === 'schedule_company') {
      const assignments = await scheduleCompany(pool, job.company_id, config.workerId, config.leaseSeconds);
      for (const assignment of assignments) {
        await pool.query(
          `INSERT INTO job(company_id,task_id,kind,payload,idempotency_key)
           VALUES($1,$2,'execute_task',jsonb_build_object('agentId',$3),$4)
           ON CONFLICT (idempotency_key) DO NOTHING`,
          [job.company_id, assignment.task_id, assignment.agent_id, `execute:${assignment.task_id}`]
        );
      }
    } else if (job.kind === 'execute_task') {
      // A próxima etapa conecta o roteador de modelos e as ferramentas. A tarefa permanece
      // claimed; nunca simulamos uma produção que ainda não aconteceu.
      await pool.query(`WITH released AS (
          UPDATE task SET status='open',lease_owner=NULL,lease_until=NULL,
            resume_after=now()+interval '5 minutes'
          WHERE id=$1 AND status='claimed' RETURNING assigned_agent_id
        ) UPDATE agent SET status='available' WHERE id=(SELECT assigned_agent_id FROM released)`, [job.task_id]);
      throw new Error('Executor de IA ainda não configurado; tarefa devolvida à fila sem conclusão');
    }
    await finishJob(pool, job.id, config.workerId);
  } catch (error) {
    console.error(`job ${job.id}:`, error.message);
    await failJob(pool, job, config.workerId, error);
  }
}

async function shutdown() {
  stopping = true;
  await pool.end();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
