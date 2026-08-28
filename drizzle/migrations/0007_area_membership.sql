-- ========================================================================= --
--  Migração 0007 — pertença a áreas (Slice 3a)                                --
--  Base do "prático a 100": disponibilidade por área + atribuição por área.    --
--                                                                             --
--   · task_areas       — em que áreas uma Task está DISPONÍVEL (gate da        --
--                        matriz; M:N task↔área).                               --
--   · user_areas       — a que áreas um trabalhador pertence (M:N user↔área).  --
--   · area_assignments — intenção ao nível da área (molde + origem do          --
--                        reconcile do botão «Atualizar»). Usada pelo código a  --
--                        partir da 3a.2; a tabela é criada já.                 --
--                                                                             --
--  Backfill: migra o legado tasks.area_id (1 área) para task_areas.           --
--  NÃO apaga tasks.area_id (não-destrutivo; fica como legado).                --
--  DDL idempotente (CREATE TABLE/INDEX IF NOT EXISTS; INSERT ... ON CONFLICT). --
-- ========================================================================= --

CREATE TABLE IF NOT EXISTS task_areas (
  task_id    uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  area_id    uuid NOT NULL REFERENCES functional_areas(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_areas_pk PRIMARY KEY (task_id, area_id)
);
CREATE INDEX IF NOT EXISTS task_areas_area_idx ON task_areas (area_id);

CREATE TABLE IF NOT EXISTS user_areas (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  area_id    uuid NOT NULL REFERENCES functional_areas(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_areas_pk PRIMARY KEY (user_id, area_id)
);
CREATE INDEX IF NOT EXISTS user_areas_area_idx ON user_areas (area_id);

CREATE TABLE IF NOT EXISTS area_assignments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id     uuid NOT NULL REFERENCES functional_areas(id) ON DELETE CASCADE,
  task_id     uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  enabled     boolean NOT NULL DEFAULT false,
  enabled_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  enabled_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS area_assignments_area_task_uq ON area_assignments (area_id, task_id);
CREATE INDEX IF NOT EXISTS area_assignments_area_idx ON area_assignments (area_id);

-- Backfill idempotente do legado tasks.area_id → task_areas.
INSERT INTO task_areas (task_id, area_id)
SELECT id, area_id FROM tasks WHERE area_id IS NOT NULL
ON CONFLICT (task_id, area_id) DO NOTHING;
