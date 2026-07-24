-- ========================================================================= --
--  Migração Tier 1 — colunas/tabelas que as features precisam e o schema      --
--  canónico ainda não tinha (isoladas por ports nos módulos).                 --
-- ========================================================================= --

-- M4: estado de publicação de Tasks (PublicationPort)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS published boolean NOT NULL DEFAULT false;

-- M1/M2: credenciais e suspensão de utilizadores
CREATE TABLE IF NOT EXISTS user_credentials (
  user_id       uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS password_reset_tokens_hash_uq
  ON password_reset_tokens (token_hash);

ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended boolean NOT NULL DEFAULT false;

-- M2: unicidade de nome de área por org (hoje só aplicacional)
CREATE UNIQUE INDEX IF NOT EXISTS functional_areas_org_name_uq
  ON functional_areas (organization_id, name);

-- M10: escopo de auditoria por org (remove o INNER JOIN e preserva logs de
-- atores apagados). Opcional mas recomendado.
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS audit_logs_org_created_idx
  ON audit_logs (organization_id, created_at DESC);

-- Handoff 23 Jul (opcionais): materializar metadados do motor de execução.
ALTER TABLE runs ADD COLUMN IF NOT EXISTS attempt integer NOT NULL DEFAULT 1;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS retry_of uuid;
-- (run_status += 'cancelled' exige recriar o enum; manter via _engine.cancelled
--  enquanto não for necessário um estado terminal distinto.)
