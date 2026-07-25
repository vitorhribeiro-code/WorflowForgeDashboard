import { z } from "zod";

/**
 * Schemas de input do M6. As rotas são controladores finos:
 * sessão → validação (aqui) → service → HTTP.
 */

/** Corpo de POST /api/connections — inicia o OAuth de uma ferramenta. */
export const startConnectionSchema = z.object({
  toolId: z.string().uuid(),
});
export type StartConnectionInput = z.infer<typeof startConnectionSchema>;

/** Query do callback OAuth. `error` é o caminho de `access_denied` do provider. */
export const callbackQuerySchema = z.object({
  state: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
  error: z.string().min(1).optional(),
});
export type CallbackQuery = z.infer<typeof callbackQuerySchema>;

/** Param de rota `[toolId]` para renew/revoke. */
export const toolIdParamSchema = z.object({
  toolId: z.string().uuid(),
});
