// Valida a FORMA dos inputs. Regras de negócio ficam no service/domínio.
import { z } from "zod";

export const periodSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Período inválido (YYYY-MM)");

export const archiveIdParam = z.object({ id: z.string().uuid() });

export const reprocessBody = z.object({ force: z.boolean().optional() });
export type ReprocessBody = z.infer<typeof reprocessBody>;

export const listQuery = z.object({
  workerId: z.string().uuid().optional(),
  period: periodSchema.optional(),
});

export const buildBody = z.object({
  period: periodSchema,
  /** omitido no job de fecho de mês (constrói para todos os workers). */
  workerId: z.string().uuid().optional(),
  orgId: z.string().uuid().optional(),
});

export type ListQuery = z.infer<typeof listQuery>;
export type BuildBody = z.infer<typeof buildBody>;
