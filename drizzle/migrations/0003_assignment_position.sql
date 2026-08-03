-- ========================================================================= --
--  Migração 0003 — ordem do board do trabalhador (Fase C1)                    --
--  `position` por atribuição: a ordem escolhida por arrasto no cartão.        --
--  NULL = por ordenar (fica no fim; a query ordena nulls last).               --
--  DDL idempotente (ADD COLUMN IF NOT EXISTS).                                --
-- ========================================================================= --

ALTER TABLE task_assignments ADD COLUMN IF NOT EXISTS position integer;
