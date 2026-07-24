import { z } from "zod";

const config = z.record(z.string(), z.unknown());

export const createAssignmentSchema = z.object({
  taskId: z.string().uuid(),
  workerId: z.string().uuid(),
  config: config.nullish(),
  schedule: z.string().min(1).max(120).nullish(),
  delivery: z.string().min(1).max(120).nullish(),
});
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;

export const toggleSchema = z.object({
  enabled: z.boolean(),
});

export const editConfigSchema = z.object({
  config: config.nullable(),
});

export const setScheduleSchema = z.object({
  // null limpa o schedule.
  schedule: z.string().min(1).max(120).nullable(),
});
