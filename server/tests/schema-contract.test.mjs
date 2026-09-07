import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const sql=await readFile(new URL('../db/001_initial.sql',import.meta.url),'utf8');
const api=await readFile(new URL('../openapi.yaml',import.meta.url),'utf8');

test('constituição e auditoria são imutáveis',()=>{
  assert.match(sql,/constitution_no_update[\s\S]+BEFORE UPDATE OR DELETE/);
  assert.match(sql,/audit_no_update[\s\S]+BEFORE UPDATE OR DELETE/);
  assert.match(sql,/immutable_principles/);
  assert.match(sql,/digest\(body::text,'sha256'\)/);
});

test('fila é durável, concorrente e idempotente',()=>{
  assert.match(sql,/lease_owner text/);
  assert.match(sql,/lease_until timestamptz/);
  assert.match(sql,/idempotency_key text NOT NULL UNIQUE/);
  assert.match(sql,/job_claim_idx/);
  assert.match(sql,/task_dependency/);
});

test('custos, artefatos, deploys e pagamentos são auditáveis',()=>{
  for(const table of ['artifact','llm_call','ledger_entry','tool_run','deployment','product','price','customer_order','payment_event'])assert.match(sql,new RegExp(`CREATE TABLE ${table} \\(`));
  assert.doesNotMatch(sql,/\b(?:amount|cost|budget|gross)[a-z_]*\s+(?:real|double precision)\b/i,'dinheiro não pode usar ponto flutuante');
  assert.match(sql,/cost_microusd bigint/);
  assert.match(sql,/amount_minor bigint/);
});

test('contrato exige idempotência, versão e webhook dedicado',()=>{
  assert.match(api,/Idempotency-Key/);
  assert.match(api,/expectedVersion/);
  assert.match(api,/text\/event-stream/);
  assert.match(api,/\/webhooks\/stripe:/);
  assert.match(api,/corpo bruto e assinatura Stripe/);
});
