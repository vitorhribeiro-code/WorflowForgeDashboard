// -------------------------------------------------------------------------- //
//  Adaptador de composição (v43): LlmResolver (módulo `ai`) → CardLlmPort (M4).//
//                                                                             //
//  O M4 não conhece os tipos concretos do `ai` — só o seu porto estreito      //
//  `CardLlmPort`. Este adaptador vive na INFRA do M4 (dependência tasks → ai,  //
//  nunca ao contrário) e é ligado nos composition roots. `getResolver` é       //
//  passado GUARDED (devolve null quando não há IA/ENCRYPTION_KEY) para que a    //
//  ausência de IA seja um 422 explícito no serviço, não um crash na carga.     //
// -------------------------------------------------------------------------- //

import type { LlmResolver } from "@/modules/ai/service/resolver";
import type { CardLlmPort } from "../service/ports";

// Capacidade de IA (authoring-time) que a org liga a um modelo na consola de IA.
// É texto livre no modelo de dados (como tools.key) — sem migração. Distinta das
// capacidades de RUNTIME (email.summary, assistant.writing): esta compõe o cartão.
export const CARD_COMPOSE_CAPABILITY = "card.compose";

export function createCardLlmPort(getResolver: () => LlmResolver | null): CardLlmPort {
  return {
    async resolve(orgId) {
      const resolver = getResolver();
      if (!resolver) return null;
      const adapter = await resolver.resolve(orgId, CARD_COMPOSE_CAPABILITY);
      if (!adapter) return null;
      return {
        complete: (input) => adapter.complete(input),
        provider: adapter.provider,
        model: adapter.model,
      };
    },
  };
}
