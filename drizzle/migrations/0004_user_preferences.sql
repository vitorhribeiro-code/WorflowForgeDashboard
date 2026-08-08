-- ========================================================================= --
--  Migração 0004 — preferências pessoais por utilizador                       --
--  users.preferences: jsonb livre com as preferências do próprio utilizador.  --
--    Hoje só o fundo do painel (self-service em «Definições pessoais»).        --
--    Cresce por chave, sem novas migrações. Normalizado na app (módulo         --
--    `preferences`), por isso a BD nunca precisa de constraints sobre o valor. --
--  DDL idempotente (ADD COLUMN IF NOT EXISTS + DEFAULT preenchendo linhas).    --
-- ========================================================================= --

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL DEFAULT '{}'::jsonb;
