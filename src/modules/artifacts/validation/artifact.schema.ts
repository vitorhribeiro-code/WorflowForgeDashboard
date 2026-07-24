// Valida a FORMA dos inputs (não as regras de negócio — essas são do service).
import { z } from "zod";

export const artifactTierSchema = z.enum(["work_document", "intermediate"]);

/** Params de rota. */
export const runIdParam = z.object({ runId: z.string().uuid() });
export const artifactIdParam = z.object({ id: z.string().uuid() });

/**
 * Input de persist (usado pelo ArtifactSink do M7).
 * `bytes` chega como Uint8Array em processo; se algum dia for exposto via HTTP,
 * aceitar base64 e descodificar na fronteira.
 */
export const persistSchema = z.object({
  runId: z.string().uuid(),
  filename: z.string().min(1).max(512),
  mimeType: z.string().max(255).nullable().default(null),
  tier: artifactTierSchema,
  bytes: z.instanceof(Uint8Array),
});

export type PersistDto = z.infer<typeof persistSchema>;
