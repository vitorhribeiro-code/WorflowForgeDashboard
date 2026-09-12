import { z } from "zod";

// POST /api/mapping/match — candidatos (leves) → propostas de runtime.
export const matchSchema = z.object({
  candidates: z
    .array(
      z.object({
        sourceRef: z.string().min(1).max(200),
        name: z.string().min(1).max(200),
        description: z.string().max(2000).nullish(),
        type: z.enum(["automation", "assistant"]),
      }),
    )
    .min(1)
    .max(200),
});

export type MatchInput = z.infer<typeof matchSchema>;
