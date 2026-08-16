import { z } from "zod";

// O corpo só transporta o token como string; a validação de pertença à paleta
// é feita no serviço (domínio) para haver uma só fonte de verdade.
export const setPreferencesSchema = z.object({
  background: z.string().optional(),
  mode: z.string().optional(),
  font: z.string().optional(),
  // string = definir a imagem; null = limpar; ausente = não mexer. O teto real
  // (formato WebP + tamanho) é validado no serviço; o max aqui é só um travão
  // grosso do corpo (o data URL ronda os ~270 KB de base64).
  customBackground: z.string().max(400_000).nullable().optional(),
  // Tokens derivados da imagem (acento por modo + tinta do cabeçalho). Forma
  // grossa aqui; o hex canónico é validado/normalizado no serviço (domínio).
  customTokens: z
    .object({
      accentLight: z.string().max(9).nullable().optional(),
      accentDark: z.string().max(9).nullable().optional(),
      litehdr: z.boolean().optional(),
    })
    .nullable()
    .optional(),
});
