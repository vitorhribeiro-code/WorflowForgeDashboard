-- ========================================================================= --
--  Migração 0008 — cartão da Task (Slice v41)                                  --
--                                                                             --
--   · tasks.card (jsonb, NULLABLE) — camada de APRESENTAÇÃO do cartão:         --
--       { template: 'size-s'|'size-m'|'size-l',                               --
--         presentation: { blurb, blocks[] } }                                 --
--     `null` → cai no cardSize() derivado (retrocompatível). O comportamento  --
--     do cartão deriva sempre do `runtime`, nunca do `card`.                  --
--                                                                             --
--  NOTA: a coluna `tasks.published` (boolean) JÁ EXISTE desde a 0001_tier1     --
--  (ADD COLUMN IF NOT EXISTS published boolean NOT NULL DEFAULT false). Esta   --
--  migração NÃO a recria — apenas o `schema.ts` passa a espelhá-la (higiene).  --
--                                                                             --
--  DDL idempotente (ADD COLUMN IF NOT EXISTS).                                --
-- ========================================================================= --

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS card jsonb;

-- ------------------------------------------------------------------------- --
--  BACKFILL de `published` — DESATIVADO por defeito.                          --
--                                                                             --
--  A 0001 criou `published` com DEFAULT false, pelo que tarefas antigas podem  --
--  estar em `false` (não-atribuíveis). Se a verificação em produção mostrar    --
--  tarefas VIVAS presas em `false` que deviam estar publicadas, correr O       --
--  UPDATE abaixo manualmente (ou descomentar numa migração de dados dedicada). --
--  Deixado comentado de propósito: publicar tudo às cegas poderia tornar       --
--  atribuíveis rascunhos legítimos. Decisão do Vitor após inspeção.            --
--                                                                             --
--    UPDATE tasks SET published = true WHERE published = false;                --
-- ------------------------------------------------------------------------- --
