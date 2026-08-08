-- ========================================================================= --
--  Migração 0005 — estilos de escrita por trabalhador                         --
--  writing_styles: o .md de estilo carregado pelo super-utilizador para cada  --
--    trabalhador. 1 linha por worker (unique), substituível (upsert). O       --
--    conteúdo vive na BD (content_md), NÃO no Drive. Texto opaco (sem parsing).--
--  DDL idempotente (CREATE TABLE/INDEX IF NOT EXISTS).                         --
-- ========================================================================= --

CREATE TABLE IF NOT EXISTS writing_styles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_md text NOT NULL,
  source_filename text,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS writing_styles_worker_uq ON writing_styles (worker_id);
