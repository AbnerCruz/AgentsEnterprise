BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE budget_allocation_type AS ENUM ('fixed','percentage');
CREATE TYPE task_status AS ENUM ('open','claimed','running','blocked','incomplete','done','cancelled');
CREATE TYPE artifact_stage AS ENUM ('draft','prototype','candidate','product');
CREATE TYPE job_status AS ENUM ('queued','leased','succeeded','failed','dead');
CREATE TYPE deployment_status AS ENUM ('queued','building','deployed','failed','rolled_back');
CREATE TYPE order_status AS ENUM ('pending','paid','failed','refunded','disputed');

CREATE TABLE app_user (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_subject text NOT NULL UNIQUE,
  email text,
  display_name text NOT NULL DEFAULT 'Proprietário',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE constitution (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  version integer NOT NULL,
  principles jsonb NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION deny_constitution_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'A constituição do projeto é append-only e imutável'; END $$;
CREATE TRIGGER constitution_no_update BEFORE UPDATE OR DELETE ON constitution
FOR EACH ROW EXECUTE FUNCTION deny_constitution_mutation();

WITH immutable_principles AS (
  SELECT jsonb_build_object(
    'maximum_objective','Criar empresas de agentes de IA que produzam produtos e serviços reais, utilizáveis, vendáveis ou distribuíveis pelo proprietário.',
    'cost_and_quality','Buscar simultaneamente o menor custo real e a maior qualidade; economia nunca autoriza truncamento, saída parcial aceita como completa ou produto medíocre.',
    'real_budget','Sincronizar o saldo real do provedor e alocar a cada empresa percentual ou valor menor ou igual ao orçamento disponível.',
    'tools','Dar ferramentas determinísticas e autorizadas a modelos econômicos para maximizar eficiência e verificar resultados.',
    'specialization','Manter cada agente na própria especialidade, com líderes que delegam primeiro e produzem quando necessário.',
    'sovereign_library','Tratar o acervo do proprietário como soberano e imutável para agentes.',
    'human_actions','Nunca inventar ações humanas ou externas; usar ferramentas autorizadas ou solicitar atuação e dados reais ao proprietário.',
    'audit','Auditar de forma append-only todo centavo, token, modelo, ferramenta, artefato, deploy, venda e decisão.'
  ) AS body
)
INSERT INTO constitution(id,version,principles,sha256)
SELECT 1,1,body,encode(digest(body::text,'sha256'),'hex') FROM immutable_principles;

CREATE TABLE company (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES app_user(id),
  name text NOT NULL,
  mission text NOT NULL,
  industry text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('founding','active','paused','archived')),
  budget_allocation budget_allocation_type NOT NULL DEFAULT 'fixed',
  budget_value_microusd bigint NOT NULL DEFAULT 0 CHECK (budget_value_microusd >= 0),
  budget_percentage numeric(7,4) NOT NULL DEFAULT 0 CHECK (budget_percentage BETWEEN 0 AND 100),
  intensive_mode boolean NOT NULL DEFAULT false,
  state_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX company_owner_name_uq ON company(owner_id, lower(name));

CREATE TABLE agent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  name text NOT NULL,
  sector text NOT NULL CHECK (sector IN ('general_management','creation','software','production','operations','commercial','finance','laboratory')),
  title text NOT NULL,
  is_sector_lead boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available','working','resting','paused','dismissed')),
  model_policy jsonb NOT NULL DEFAULT '{"light":true,"standard":true,"advanced":"escalation_only"}',
  created_at timestamptz NOT NULL DEFAULT now(),
  dismissed_at timestamptz
);
CREATE UNIQUE INDEX one_active_lead_per_sector ON agent(company_id,sector) WHERE is_sector_lead AND dismissed_at IS NULL;

CREATE TABLE project (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  name text NOT NULL,
  objective text NOT NULL,
  kind text NOT NULL DEFAULT 'product' CHECK (kind IN ('product','institutional_site','branch')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked','completed','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE task (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  sector text NOT NULL,
  title text NOT NULL,
  brief text NOT NULL,
  status task_status NOT NULL DEFAULT 'open',
  assigned_agent_id uuid REFERENCES agent(id),
  priority smallint NOT NULL DEFAULT 50 CHECK (priority BETWEEN 0 AND 100),
  semantic_key text NOT NULL,
  idempotency_key text NOT NULL,
  quality_attempts integer NOT NULL DEFAULT 0,
  transient_failures integer NOT NULL DEFAULT 0,
  resume_after timestamptz,
  lease_owner text,
  lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  UNIQUE(project_id,idempotency_key)
);
CREATE INDEX task_claim_idx ON task(status,resume_after,priority DESC,created_at) WHERE status IN ('open','claimed');

CREATE TABLE task_dependency (
  task_id uuid NOT NULL REFERENCES task(id) ON DELETE CASCADE,
  depends_on_id uuid NOT NULL REFERENCES task(id) ON DELETE RESTRICT,
  PRIMARY KEY(task_id,depends_on_id),
  CHECK (task_id <> depends_on_id)
);

CREATE TABLE library_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES app_user(id),
  company_id uuid REFERENCES company(id) ON DELETE CASCADE,
  project_id uuid REFERENCES project(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('global','company','project')),
  name text NOT NULL,
  media_type text NOT NULL,
  object_key text NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  immutable_for_agents boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1,
  created_by text NOT NULL DEFAULT 'owner' CHECK (created_by IN ('owner','promoted_product')),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE artifact (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  lineage_id uuid NOT NULL,
  task_id uuid REFERENCES task(id),
  stage artifact_stage NOT NULL,
  name text NOT NULL,
  media_type text NOT NULL,
  object_key text NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  bytes bigint NOT NULL CHECK (bytes >= 0),
  version integer NOT NULL DEFAULT 1,
  incomplete boolean NOT NULL DEFAULT false,
  author_agent_id uuid REFERENCES agent(id),
  validation jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id,lineage_id,version,stage)
);
CREATE INDEX artifact_project_stage_idx ON artifact(project_id,stage,created_at DESC);

CREATE TABLE llm_call (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES agent(id),
  task_id uuid REFERENCES task(id),
  artifact_id uuid REFERENCES artifact(id),
  provider text NOT NULL,
  model text NOT NULL,
  level text NOT NULL CHECK (level IN ('light','standard','advanced','image')),
  purpose text NOT NULL,
  input_tokens bigint NOT NULL DEFAULT 0,
  output_tokens bigint NOT NULL DEFAULT 0,
  reasoning_tokens bigint NOT NULL DEFAULT 0,
  cost_microusd bigint NOT NULL DEFAULT 0 CHECK (cost_microusd >= 0),
  latency_ms integer,
  finish_reason text,
  success boolean NOT NULL,
  transient boolean NOT NULL DEFAULT false,
  incomplete boolean NOT NULL DEFAULT false,
  provider_request_id text,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX llm_call_company_time_idx ON llm_call(company_id,created_at DESC);

CREATE TABLE ledger_entry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES company(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('provider_credit','ai_cost','sale_gross','fee','tax','refund','chargeback','payout','adjustment')),
  amount_microusd bigint NOT NULL,
  currency char(3) NOT NULL DEFAULT 'USD',
  external_id text,
  idempotency_key text NOT NULL UNIQUE,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ledger_company_time_idx ON ledger_entry(company_id,created_at DESC);

CREATE TABLE meeting_entry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  actor_type text NOT NULL CHECK (actor_type IN ('owner','agent','system')),
  actor_id uuid,
  category text NOT NULL,
  body text NOT NULL,
  requires_owner boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE job (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES company(id) ON DELETE CASCADE,
  task_id uuid REFERENCES task(id) ON DELETE CASCADE,
  kind text NOT NULL,
  payload jsonb NOT NULL,
  status job_status NOT NULL DEFAULT 'queued',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 8,
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_owner text,
  lease_until timestamptz,
  last_error text,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX job_claim_idx ON job(status,available_at,created_at) WHERE status IN ('queued','leased');

CREATE TABLE tool_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES agent(id),
  task_id uuid REFERENCES task(id),
  tool_name text NOT NULL,
  permission_scope text NOT NULL,
  request jsonb NOT NULL,
  response_digest text,
  success boolean NOT NULL,
  cost_microusd bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE deployment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  artifact_id uuid NOT NULL REFERENCES artifact(id),
  provider text NOT NULL,
  environment text NOT NULL,
  status deployment_status NOT NULL DEFAULT 'queued',
  external_id text,
  public_url text,
  commit_sha text,
  previous_deployment_id uuid REFERENCES deployment(id),
  approved_by_owner_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  deployed_at timestamptz
);

CREATE TABLE product (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES project(id),
  artifact_id uuid NOT NULL REFERENCES artifact(id),
  name text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','retired')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE price (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  currency char(3) NOT NULL,
  external_price_id text UNIQUE,
  tax_code text,
  active boolean NOT NULL DEFAULT false,
  approved_by_owner_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE customer_order (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES product(id),
  price_id uuid NOT NULL REFERENCES price(id),
  status order_status NOT NULL DEFAULT 'pending',
  checkout_session_id text UNIQUE,
  payment_intent_id text UNIQUE,
  customer_email_hash text,
  gross_minor bigint NOT NULL,
  currency char(3) NOT NULL,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payment_event (
  id text PRIMARY KEY,
  event_type text NOT NULL,
  livemode boolean NOT NULL,
  payload_sha256 text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processing_error text
);

CREATE TABLE audit_event (
  id bigserial PRIMARY KEY,
  owner_id uuid REFERENCES app_user(id),
  company_id uuid REFERENCES company(id),
  actor_type text NOT NULL,
  actor_id text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_company_time_idx ON audit_event(company_id,created_at DESC);

CREATE FUNCTION deny_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Eventos de auditoria são append-only'; END $$;
CREATE TRIGGER audit_no_update BEFORE UPDATE OR DELETE ON audit_event
FOR EACH ROW EXECUTE FUNCTION deny_audit_mutation();

COMMIT;
