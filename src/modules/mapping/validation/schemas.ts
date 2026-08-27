import { z } from "zod";

const jsonSchema = z.record(z.string(), z.unknown());

const opportunitySchema = z.object({
  id: z.string().max(200).optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  mode: z.enum(["automation", "assistant"]).optional(),
  trigger: z.enum(["manual", "schedule", "event"]).optional(),
  runtimeHint: z.string().min(1).max(120).optional(),
  tools: z
    .array(z.object({ key: z.string().min(1).max(60), scopes: z.array(z.string()).optional() }))
    .max(50)
    .optional(),
  configSchema: jsonSchema.optional(),
});

// Documento de mapeamento. Falha de forma ⇒ "formato não reconhecido".
export const mappingDocumentSchema = z.object({
  version: z.string().max(20).optional(),
  source: z.string().max(200).optional(),
  opportunities: z.array(opportunitySchema).min(1).max(200),
});

// Candidato (rascunho) + overrides do admin na conversão.
const candidateSchema = z.object({
  sourceRef: z.string(),
  name: z.string().min(1),
  description: z.string().nullable(),
  type: z.enum(["automation", "assistant"]),
  runtime: z.string().nullable(),
  requiredTools: z.array(z.object({ toolKey: z.string(), scopes: z.array(z.string()) })),
  configSchema: jsonSchema.nullable(),
});

// Decisão do admin perante uma colisão (dedup slice 2).
const decisionSchema = z.union([
  z.object({ kind: z.literal("create") }),
  z.object({ kind: z.literal("reuse"), taskId: z.string().uuid() }),
]);

export const convertSchema = z.object({
  candidate: candidateSchema,
  overrides: z
    .object({
      type: z.enum(["automation", "assistant"]).optional(),
      runtime: z.string().min(1).max(120).optional(),
      areaId: z.string().uuid().nullish(),
      configSchema: jsonSchema.nullish(),
    })
    .optional(),
  decision: decisionSchema.optional(),
});
