CREATE TYPE "public"."archive_status" AS ENUM('pending', 'running', 'success', 'error');--> statement-breakpoint
CREATE TYPE "public"."artifact_location" AS ENUM('worker_cloud', 'ephemeral');--> statement-breakpoint
CREATE TYPE "public"."artifact_tier" AS ENUM('work_document', 'intermediate');--> statement-breakpoint
CREATE TYPE "public"."connection_status" AS ENUM('pending', 'connected', 'expired', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('queued', 'running', 'success', 'error');--> statement-breakpoint
CREATE TYPE "public"."run_trigger" AS ENUM('manual', 'schedule', 'webhook');--> statement-breakpoint
CREATE TYPE "public"."task_type" AS ENUM('automation', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."tool_auth_type" AS ENUM('oauth', 'api_key', 'none');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('super_admin', 'worker');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "functional_areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monthly_archives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"worker_id" uuid NOT NULL,
	"period" text NOT NULL,
	"status" "archive_status" DEFAULT 'pending' NOT NULL,
	"archive_folder_ref" text,
	"manifest" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text,
	"tier" "artifact_tier" NOT NULL,
	"location" "artifact_location" NOT NULL,
	"storage_ref" text NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"status" "run_status" DEFAULT 'queued' NOT NULL,
	"trigger" "run_trigger" NOT NULL,
	"idempotency_key" text,
	"input" jsonb,
	"output" jsonb,
	"error" text,
	"triggered_by" uuid,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"worker_id" uuid NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"schedule" text,
	"delivery" text,
	"config" jsonb,
	"enabled_by" uuid,
	"enabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_required_tools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"tool_id" uuid NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"area_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"type" "task_type" NOT NULL,
	"runtime" text NOT NULL,
	"config_schema" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"auth_type" "tool_auth_type" NOT NULL,
	"available_scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"role" "user_role" DEFAULT 'worker' NOT NULL,
	"mapping_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worker_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"worker_id" uuid NOT NULL,
	"tool_id" uuid NOT NULL,
	"granted_scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"credentials_encrypted" text,
	"root_folder_ref" text,
	"status" "connection_status" DEFAULT 'pending' NOT NULL,
	"connected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "functional_areas" ADD CONSTRAINT "functional_areas_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_archives" ADD CONSTRAINT "monthly_archives_worker_id_users_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_artifacts" ADD CONSTRAINT "run_artifacts_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_assignment_id_task_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."task_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_triggered_by_users_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_worker_id_users_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_enabled_by_users_id_fk" FOREIGN KEY ("enabled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_required_tools" ADD CONSTRAINT "task_required_tools_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_required_tools" ADD CONSTRAINT "task_required_tools_tool_id_tools_id_fk" FOREIGN KEY ("tool_id") REFERENCES "public"."tools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_area_id_functional_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."functional_areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_connections" ADD CONSTRAINT "worker_connections_worker_id_users_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_connections" ADD CONSTRAINT "worker_connections_tool_id_tools_id_fk" FOREIGN KEY ("tool_id") REFERENCES "public"."tools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "functional_areas_org_idx" ON "functional_areas" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "monthly_archives_worker_period_uq" ON "monthly_archives" USING btree ("worker_id","period");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_uq" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "run_artifacts_run_idx" ON "run_artifacts" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "run_artifacts_tier_archived_idx" ON "run_artifacts" USING btree ("tier","archived");--> statement-breakpoint
CREATE INDEX "runs_assignment_idx" ON "runs" USING btree ("assignment_id");--> statement-breakpoint
CREATE INDEX "runs_status_idx" ON "runs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "runs_idempotency_uq" ON "runs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "task_assignments_task_worker_uq" ON "task_assignments" USING btree ("task_id","worker_id");--> statement-breakpoint
CREATE INDEX "task_assignments_worker_enabled_idx" ON "task_assignments" USING btree ("worker_id","enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "task_required_tools_task_tool_uq" ON "task_required_tools" USING btree ("task_id","tool_id");--> statement-breakpoint
CREATE INDEX "task_required_tools_task_idx" ON "task_required_tools" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "tasks_org_idx" ON "tasks" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "tasks_area_idx" ON "tasks" USING btree ("area_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tools_key_uq" ON "tools" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_org_idx" ON "users" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "worker_connections_worker_tool_uq" ON "worker_connections" USING btree ("worker_id","tool_id");--> statement-breakpoint
CREATE INDEX "worker_connections_worker_idx" ON "worker_connections" USING btree ("worker_id");--> statement-breakpoint
CREATE INDEX "worker_connections_status_idx" ON "worker_connections" USING btree ("status");