import { z } from "zod";

export const assignmentIdParamSchema = z.object({
  assignmentId: z.string().uuid(),
});

// Input do Run assistido (payload de negócio; validado depois pelo handler).
export const assistedStartSchema = z.object({
  input: z.record(z.string(), z.unknown()).default({}),
});

// Trigger manual de uma automática (corpo opcional; o input é payload de negócio,
// validado depois pelo handler do runtime).
export const manualRunSchema = z.object({
  input: z.record(z.string(), z.unknown()).optional(),
});

// Parâmetro de rota [id] para /api/runs/[id].
export const runIdParamSchema = z.object({
  id: z.string().uuid(),
});

// Enfileirar (execução automática por schedule/webhook/manual).
export const enqueueSchema = z.object({
  assignmentId: z.string().uuid(),
  trigger: z.enum(["manual", "schedule", "webhook"]),
  windowKey: z.string().max(200).nullish(),
  input: z.record(z.string(), z.unknown()).optional(),
});
