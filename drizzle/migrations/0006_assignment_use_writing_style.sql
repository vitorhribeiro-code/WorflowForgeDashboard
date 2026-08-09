-- ========================================================================= --
--  Migração 0006 — flag "usar estilo de escrita" por atribuição               --
--  task_assignments.use_writing_style: quando true, as gerações assistidas de  --
--    escrita deste worker usam o .md de estilo dele (tom "meu" forçado).       --
--  Flag de comportamento do admin — NÃO é config de formulário (fica fora do   --
--    config jsonb para não colidir com o config_schema).                       --
--  DDL idempotente.                                                            --
-- ========================================================================= --

ALTER TABLE task_assignments
  ADD COLUMN IF NOT EXISTS use_writing_style boolean NOT NULL DEFAULT false;
