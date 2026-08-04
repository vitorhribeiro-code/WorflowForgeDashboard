// Composition root do registo de IA (§5.2 fase 1b). Lazy singleton, como o M6:
// exige a ENCRYPTION_KEY só quando a service é de facto usada (rotas), para não
// rebentar o carregamento de módulos que não tocam em chaves.
import { db } from "@/db/client";
import { createDrizzleAudit } from "@/lib/audit.drizzle";
import { createCipher } from "@/modules/connections/service/crypto";
import { loadEnv } from "@/platform/config/env";
import { createDrizzleAiRegistryRepository } from "./data/ai-registry.repository";
import { createAiRegistryService, type AiRegistryService } from "./service/ai-registry.service";

let cached: AiRegistryService | null = null;

export function getAiRegistryService(): AiRegistryService {
  if (cached) return cached;
  const env = loadEnv();

  if (!env.ENCRYPTION_KEY) {
    throw new Error(
      "ENCRYPTION_KEY em falta: necessária para cifrar as chaves de IA (§5.2).",
    );
  }
  // Mesma conversão do M6: o env guarda hex (32 bytes = 64 chars); o Cipher
  // espera base64. Reusar o MESMO ENCRYPTION_KEY é o que garante que as chaves
  // cifradas aqui são decifráveis pelo resolver (Fase 2) em Vercel e Railway.
  const keyBase64 = Buffer.from(env.ENCRYPTION_KEY, "hex").toString("base64");

  cached = createAiRegistryService({
    repo: createDrizzleAiRegistryRepository(db),
    cipher: createCipher(keyBase64),
    audit: createDrizzleAudit(db),
  });
  return cached;
}
