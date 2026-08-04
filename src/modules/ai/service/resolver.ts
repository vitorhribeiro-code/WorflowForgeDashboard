/**
 * Resolver de IA (§5.2 fase 2) — system-context.
 *
 * Dado (org, capability), encontra o binding da org, lê o provider, decifra a
 * chave (mesmo cipher/ENCRYPTION_KEY do M6) e constrói o adapter concreto. Se
 * algo faltar — sem binding, provider desativado/sem chave, sem modelo, ou
 * provider sem adapter conhecido — devolve null e o consumidor faz fallback.
 *
 * A chave decifrada NUNCA sai daqui: fica dentro do adapter, no processo server.
 */

import type { Cipher } from "@/modules/connections/service/crypto";
import type { LlmAdapterConfig, LlmPort } from "@/platform/ai/port";
import type { AiResolverPort } from "../data/ai-registry.repository";

export interface LlmResolver {
  /** Adapter pronto para a capacidade, ou null (fallback no consumidor). */
  resolve(orgId: string, capability: string): Promise<LlmPort | null>;
}

export interface LlmResolverDeps {
  repo: AiResolverPort;
  cipher: Cipher;
  // Fábrica de adapter por provider; null se o provider não tem adapter.
  createAdapter: (provider: string, cfg: LlmAdapterConfig) => LlmPort | null;
}

export function createLlmResolver({
  repo,
  cipher,
  createAdapter,
}: LlmResolverDeps): LlmResolver {
  return {
    async resolve(orgId, capability) {
      const binding = await repo.getBindingByCapability(orgId, capability);
      if (!binding) return null;

      const secret = await repo.getProviderSecret(orgId, binding.provider);
      // Provider inexistente, desativado ou sem chave → sem IA (fallback).
      if (!secret || !secret.enabled || !secret.apiKeyEncrypted) return null;

      // Modelo: o do binding tem prioridade; senão o default do provider.
      const model = binding.model ?? secret.defaultModel;
      if (!model) return null; // não dá para chamar sem modelo

      let apiKey: string;
      try {
        apiKey = cipher.decrypt(secret.apiKeyEncrypted);
      } catch {
        // Chave corrompida / ENCRYPTION_KEY trocada → tratar como sem IA.
        return null;
      }

      // Provider sem adapter conhecido → null (fallback).
      return createAdapter(binding.provider, { apiKey, model });
    },
  };
}
