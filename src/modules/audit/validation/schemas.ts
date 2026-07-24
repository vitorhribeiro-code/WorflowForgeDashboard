import { z } from "zod";
import { MAX_PAGE_SIZE } from "../domain/pagination";

// Query strings → tudo string; coerção explícita. Datas em ISO 8601.
const isoDate = z.coerce.date();

export const auditQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(25),
    actorId: z.string().uuid().optional(),
    action: z.string().min(1).max(120).optional(),
    entity: z.string().min(1).max(120).optional(),
    entityId: z.string().uuid().optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
  })
  .refine((v) => !v.from || !v.to || v.from < v.to, {
    message: "from tem de ser anterior a to",
    path: ["from"],
  });

export type AuditQueryInput = z.infer<typeof auditQuerySchema>;

export const metricsQuerySchema = z
  .object({
    from: isoDate.optional(),
    to: isoDate.optional(),
  })
  .refine((v) => !v.from || !v.to || v.from < v.to, {
    message: "from tem de ser anterior a to",
    path: ["from"],
  });

export type MetricsQueryInput = z.infer<typeof metricsQuerySchema>;
