-- ========================================================================= --
--  Migração 0009 — catálogo de runtimes (Slice v50, fundação)                 --
--                                                                             --
--   · runtime_kind (enum) — 'builtin' | 'generic'.                            --
--   · runtimes (tabela GLOBAL, como `tools`) — o catálogo de capacidades.      --
--       key (único), label, task_type, kind, spec (jsonb, null nos built-in).  --
--                                                                             --
--  SEED dos 4 built-in (espelham RUNTIMES em src/modules/tasks/domain/         --
--  runtimes.ts). O isKnownRuntime continua a reconhecer os built-in por        --
--  CÓDIGO (array), pelo que esta migração NÃO abre janela de quebra mesmo que  --
--  o deploy da app preceda o seed: a BD ACRESCENTA os generated, não é a       --
--  fonte-de-verdade dos built-in.                                             --
--                                                                             --
--  DDL idempotente (enum via DO/EXCEPTION; CREATE TABLE/INDEX IF NOT EXISTS;   --
--  INSERT ... ON CONFLICT DO NOTHING).                                        --
-- ========================================================================= --

DO $$ BEGIN
  CREATE TYPE "public"."runtime_kind" AS ENUM('builtin', 'generic');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "runtimes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"task_type" "task_type" NOT NULL,
	"kind" "runtime_kind" DEFAULT 'generic' NOT NULL,
	"spec" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "runtimes_key_uq" ON "runtimes" ("key");
--> statement-breakpoint

-- Seed dos 4 built-in (fonte: domain/runtimes.ts). kind='builtin', spec=NULL.
INSERT INTO "runtimes" ("key", "label", "task_type", "kind") VALUES
  ('assistant.generic', 'Assistente genérico (stream)', 'assistant', 'builtin'),
  ('assistant.writing', 'Assistente de escrita',        'assistant', 'builtin'),
  ('email.digest',      'Resumo de emails',             'automation', 'builtin'),
  ('report.monthly',    'Relatório mensal',             'automation', 'builtin')
ON CONFLICT ("key") DO NOTHING;
