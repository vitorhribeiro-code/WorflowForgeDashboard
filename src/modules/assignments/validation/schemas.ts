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

export const setWritingStyleSchema = z.object({
  enabled: z.boolean(),
});

export const setScheduleSchema = z.object({
  // null limpa o schedule.
  schedule: z.string().min(1).max(120).nullable(),
});

// Ordem do board do trabalhador: lista de assignmentIds na nova ordem.
export const reorderSchema = z.object({
  order: z.array(z.string().uuid()).min(1).max(200),
});

// Definir o conjunto de áreas de um trabalhador ou de uma tarefa (substituição
// de conjunto). Lista vazia = remover de todas as áreas. Deduplicado no serviço.
export const setAreasSchema = z.object({
  areaIds: z.array(z.string().uuid()).max(100),
});

// Mapa de áreas: ligar/desligar (fan-out) uma tarefa numa área.
export const setAreaAssignmentSchema = z.object({
  areaId: z.string().uuid(),
  taskId: z.string().uuid(),
  enabled: z.boolean(),
});

// Mapa de áreas: remover a intenção de uma tarefa numa área (desativa o fan-out).
export const removeAreaAssignmentSchema = z.object({
  areaId: z.string().uuid(),
  taskId: z.string().uuid(),
});
