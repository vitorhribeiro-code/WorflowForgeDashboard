import { z } from "zod";
import { TASK_TYPES } from "../domain/types";

const jsonSchema = z.record(z.string(), z.unknown());

export const createTaskSchema = z.object({
  name: z.string().min(1).max(160),
  description: z.string().max(2000).nullish(),
  type: z.enum(TASK_TYPES as unknown as [string, ...string[]]),
  runtime: z.string().min(1).max(120),
  areaId: z.string().uuid().nullish(),
  configSchema: jsonSchema.nullish(),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z
  .object({
    name: z.string().min(1).max(160).optional(),
    description: z.string().max(2000).nullish(),
    runtime: z.string().min(1).max(120).optional(),
    areaId: z.string().uuid().nullish(),
    configSchema: jsonSchema.nullish(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nada para atualizar" });
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

const requiredTool = z.object({
  toolId: z.string().uuid(),
  scopes: z.array(z.string().min(1).max(200)).max(200).default([]),
});

export const setRequiredToolsSchema = z.object({
  items: z.array(requiredTool).max(50),
});
export type SetRequiredToolsInput = z.infer<typeof setRequiredToolsSchema>;

export const listTasksQuerySchema = z.object({
  areaId: z.string().uuid().optional(),
  type: z.enum(TASK_TYPES as unknown as [string, ...string[]]).optional(),
});
