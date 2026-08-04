import { z } from "zod";

// provider/capability são texto livre (extensíveis sem migração, como tools.key).
// Normalização (trim/lowercase do provider) fica na service, não aqui.

export const createProviderSchema = z.object({
  provider: z.string().min(1).max(60),
  // apiKey é opcional: pode registar-se o provider e definir a chave depois.
  apiKey: z.string().min(1).max(400).optional(),
  defaultModel: z.string().max(120).nullish(),
  enabled: z.boolean().optional(),
});

export const updateProviderSchema = z
  .object({
    // Presente e não-vazia → re-cifra. Ausente → mantém a chave guardada.
    apiKey: z.string().min(1).max(400).optional(),
    defaultModel: z.string().max(120).nullish(),
    enabled: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nada para atualizar" });

// Binding é upsert por (org, capability): definir a capacidade fixa o provider/model.
export const setBindingSchema = z.object({
  capability: z.string().min(1).max(60),
  provider: z.string().min(1).max(60),
  model: z.string().max(120).nullish(),
});
