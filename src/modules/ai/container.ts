// Composition root do registo de IA (§5.2 fase 1b). Lazy singleton, como o M6:
// exige a ENCRYPTION_KEY só quando a service é de facto usada (rotas), para não
// rebentar o carregamento de módulos que não tocam em chaves.
import { db } from "@/db/client";
import { createDrizzleAudit } from "@/lib/audit.drizzle";
import { createCipher } from "@/modules/connections/service/crypto";
import { loadEnv } from "@/platform/config/env";
import { createAdapter } from "@/platform/ai/registry";
import {
  createDrizzleAiRegistryRepository,
  createDrizzleAiResolverPort,
} from "./data/ai-registry.repository";
import { createAiRegistryService, type AiRegistryService } from "./service/ai-registry.service";
import { createLlmResolver, type LlmResolver } from "./service/resolver";

function encryptionKeyBase64OrThrow(): string {
  const env = loadEnv();
  if (!env.ENCRYPTION_KEY) {
    throw new Error(
      "ENCRYPTION_KEY em falta: necessária para cifrar/decifrar as chaves de IA (§5.2).",
    );
  }
  // Mesma conversão do M6: hex (64 chars) → base64 para o Cipher.
  return Buffer.from(env.ENCRYPTION_KEY, "hex").toString("base64");
}

let cached: AiRegistryService | null = null;

export function getAiRegistryService(): AiRegistryService {
  if (cached) return cached;
  cached = createAiRegistryService({
    repo: createDrizzleAiRegistryRepository(db),
    cipher: createCipher(encryptionKeyBase64OrThrow()),
    audit: createDrizzleAudit(db),
  });
  return cached;
}

/**
 * Resolver de IA (Fase 2) — lazy singleton. Usa o MESMO ENCRYPTION_KEY (a chave
 * cifrada pela registry service é decifrável aqui) e o registry de adapters.
 * Consumido em contexto de sistema (handlers do M7 na Fase 3), nunca por HTTP.
 */
let cachedResolver: LlmResolver | null = null;

export function getLlmResolver(): LlmResolver {
  if (cachedResolver) return cachedResolver;
  cachedResolver = createLlmResolver({
    repo: createDrizzleAiResolverPort(db),
    cipher: createCipher(encryptionKeyBase64OrThrow()),
    createAdapter,
  });
  return cachedResolver;
}
