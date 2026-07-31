-- ========================================================================= --
--  Migração 0002 — Registo de IA (§5.2 fase 1a)                               --
--  ai_providers: chave de API por (org, provider), cifrada ao nível da app    --
--    (mesmo credsCodec do M6; a coluna guarda só o blob cifrado).             --
--  ai_bindings:  binding capability -> provider/model, por (org, capability).  --
--  DDL idempotente (segue o padrão do 0001_tier1: CREATE ... IF NOT EXISTS).  --
-- ========================================================================= --

CREATE TABLE IF NOT EXISTS ai_providers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider          text NOT NULL,
  api_key_encrypted text,
  default_model     text,
  enabled           boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ai_providers_org_provider_uq
  ON ai_providers (organization_id, provider);
CREATE INDEX IF NOT EXISTS ai_providers_org_idx
  ON ai_providers (organization_id);

CREATE TABLE IF NOT EXISTS ai_bindings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  capability      text NOT NULL,
  provider        text NOT NULL,
  model           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ai_bindings_org_capability_uq
  ON ai_bindings (organization_id, capability);
CREATE INDEX IF NOT EXISTS ai_bindings_org_idx
  ON ai_bindings (organization_id);
