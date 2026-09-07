BEGIN;

ALTER TABLE agent ADD COLUMN last_task_claimed_at timestamptz;
ALTER TABLE agent ADD COLUMN tasks_completed bigint NOT NULL DEFAULT 0;

CREATE TABLE activity_event (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES agent(id),
  task_id uuid REFERENCES task(id),
  category text NOT NULL,
  body jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activity_event_company_cursor_idx ON activity_event(company_id,id);

CREATE VIEW workforce_capacity AS
WITH sectors AS (
  SELECT company_id,sector,COUNT(*) FILTER (WHERE dismissed_at IS NULL)::integer AS active_agents,
    COUNT(*) FILTER (WHERE dismissed_at IS NULL AND status='available')::integer AS available_agents
  FROM agent GROUP BY company_id,sector
), demand AS (
  SELECT p.company_id,t.sector,
    COUNT(*) FILTER (WHERE t.status IN ('open','claimed','running','blocked'))::integer AS open_tasks,
    COUNT(*) FILTER (WHERE t.status IN ('claimed','running'))::integer AS active_tasks
  FROM task t JOIN project p ON p.id=t.project_id GROUP BY p.company_id,t.sector
)
SELECT COALESCE(s.company_id,d.company_id) AS company_id,
  COALESCE(s.sector,d.sector) AS sector,
  COALESCE(s.active_agents,0) AS active_agents,
  COALESCE(s.available_agents,0) AS available_agents,
  COALESCE(d.open_tasks,0) AS open_tasks,
  COALESCE(d.active_tasks,0) AS active_tasks,
  GREATEST(0,COALESCE(d.open_tasks,0)-COALESCE(s.active_agents,0)) AS unmet_capacity,
  GREATEST(0,COALESCE(s.available_agents,0)-COALESCE(d.open_tasks,0)) AS surplus_capacity
FROM sectors s FULL OUTER JOIN demand d USING(company_id,sector);

CREATE OR REPLACE FUNCTION schedule_company_tasks(
  requested_company_id uuid,
  requested_worker_id text,
  requested_lease_seconds integer DEFAULT 120
) RETURNS TABLE(task_id uuid,agent_id uuid,sector text,is_sector_lead boolean)
LANGUAGE plpgsql AS $$
DECLARE
  worker agent%ROWTYPE;
  selected_task task%ROWTYPE;
BEGIN
  IF requested_lease_seconds < 30 OR requested_lease_seconds > 3600 THEN
    RAISE EXCEPTION 'lease inválido';
  END IF;

  -- Colaboradores recebem trabalho primeiro; líderes só produzem o excedente.
  FOR worker IN
    SELECT * FROM agent
    WHERE company_id=requested_company_id AND dismissed_at IS NULL AND status='available'
    ORDER BY is_sector_lead ASC,last_task_claimed_at NULLS FIRST,created_at
    FOR UPDATE SKIP LOCKED
  LOOP
    SELECT t.* INTO selected_task
    FROM task t
    JOIN project p ON p.id=t.project_id
    WHERE p.company_id=requested_company_id
      AND p.status='active'
      AND t.sector=worker.sector
      AND t.status='open'
      AND (t.resume_after IS NULL OR t.resume_after<=now())
      AND (t.assigned_agent_id IS NULL OR t.assigned_agent_id=worker.id)
      AND NOT EXISTS (
        SELECT 1 FROM task_dependency d
        JOIN task prerequisite ON prerequisite.id=d.depends_on_id
        WHERE d.task_id=t.id AND prerequisite.status<>'done'
      )
    ORDER BY (t.assigned_agent_id=worker.id) DESC,t.priority DESC,t.created_at
    FOR UPDATE OF t SKIP LOCKED LIMIT 1;

    IF selected_task.id IS NULL THEN CONTINUE; END IF;

    UPDATE task SET status='claimed',assigned_agent_id=worker.id,
      lease_owner=requested_worker_id,
      lease_until=now()+make_interval(secs=>requested_lease_seconds)
    WHERE id=selected_task.id;
    UPDATE agent SET status='working',last_task_claimed_at=now() WHERE id=worker.id;
    INSERT INTO activity_event(company_id,agent_id,task_id,category,body)
    VALUES(requested_company_id,worker.id,selected_task.id,'task_claimed',
      jsonb_build_object('sector',worker.sector,'leaderFallback',worker.is_sector_lead));

    task_id := selected_task.id;
    agent_id := worker.id;
    sector := worker.sector;
    is_sector_lead := worker.is_sector_lead;
    RETURN NEXT;
  END LOOP;
END $$;

COMMIT;
