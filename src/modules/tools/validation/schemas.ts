import { z } from "zod";
import { TOOL_AUTH_TYPES } from "../domain/types";
import { TOOL_KEY_RE } from "../domain/tool";

const scope = z.string().min(1).max(200);
const scopeList = z.array(scope).max(200);

export const createToolSchema = z.object({
  key: z.string().min(2).max(60).regex(TOOL_KEY_RE, "slug inválido"),
  name: z.string().min(1).max(120),
  authType: z.enum(TOOL_AUTH_TYPES as unknown as [string, ...string[]]),
  availableScopes: scopeList.default([]),
});

export type CreateToolInput = z.infer<typeof createToolSchema>;

export const updateToolSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    availableScopes: scopeList.optional(),
  })
  .refine((v) => v.name !== undefined || v.availableScopes !== undefined, {
    message: "Nada para atualizar",
  });

export type UpdateToolInput = z.infer<typeof updateToolSchema>;
