import { z } from "zod";

// O corpo só transporta o token como string; a validação de pertença à paleta
// é feita no serviço (domínio) para haver uma só fonte de verdade.
export const setBackgroundSchema = z.object({
  background: z.string(),
});
