import { z } from "zod";

// O corpo transporta o ficheiro já lido como texto no cliente. A validação de
// tipo/tamanho/não-vazio é do domínio (serviço), para uma só fonte de verdade.
export const uploadStyleSchema = z.object({
  filename: z.string().min(1),
  contentMd: z.string(),
});
