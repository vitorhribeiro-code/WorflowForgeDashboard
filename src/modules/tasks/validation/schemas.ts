import { z } from "zod";
import { TASK_TYPES } from "../domain/types";
import { CARD_STATUSES, CARD_TEMPLATES } from "../domain/card";

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

// Envelope da rota de cartão (v42). Forma solta de propósito: a validação
// determinística (catálogo/envelope/ícones/status) é do DOMÍNIO — `setCard`
// chama `validateCard` e devolve 422 INVALID_CARD com os erros. `null` limpa.
export const setCardSchema = z.object({
  card: z.union([z.record(z.string(), z.unknown()), z.null()]),
});
export type SetCardInput = z.infer<typeof setCardSchema>;

// Geração do cartão via IA (v43 + v44). `template` opcional: se ausente, o
// serviço usa o do cartão atual ou o derivado do tipo da tarefa. `instructions`
// (v44) são orientações livres do editor por prompt — ausentes ⇒ geração de raiz.
export const generateCardSchema = z.object({
  template: z.enum(CARD_TEMPLATES as unknown as [string, ...string[]]).optional(),
  instructions: z.string().max(2000).nullish(),
});
export type GenerateCardInput = z.infer<typeof generateCardSchema>;

// Estado do cartão (v44): flip draft↔ready («Validar» / «Voltar a rascunho»).
// Default `ready` (o caso comum é validar). A validação forte (cartão existe,
// tem conteúdo) é do DOMÍNIO — `setCardStatus` devolve 422 se falhar.
export const cardStatusSchema = z.object({
  status: z.enum(CARD_STATUSES as unknown as [string, ...string[]]).default("ready"),
});
export type CardStatusInput = z.infer<typeof cardStatusSchema>;

export const listTasksQuerySchema = z.object({
  areaId: z.string().uuid().optional(),
  type: z.enum(TASK_TYPES as unknown as [string, ...string[]]).optional(),
});
