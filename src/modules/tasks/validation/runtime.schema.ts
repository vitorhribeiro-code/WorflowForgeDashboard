import { z } from "zod";

// Criar runtime generated (v52). A key é revalidada no domínio (isValidRuntimeKey).
export const createRuntimeSchema = z.object({
  key: z.string().min(3).max(60),
  label: z.string().min(1).max(120),
  taskType: z.enum(["automation", "assistant"]),
  instruction: z.string().min(1).max(4000),
  system: z.string().max(2000).optional(),
});

export type CreateRuntimeInput = z.infer<typeof createRuntimeSchema>;
