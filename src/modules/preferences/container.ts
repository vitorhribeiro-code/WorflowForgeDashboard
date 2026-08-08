// Composition root das preferências. Sem env nem cifra: é só um jsonb por
// utilizador. Lazy singleton, como os outros módulos.
import { db } from "@/db/client";
import { createDrizzlePreferencesRepository } from "./data/preferences.repository";
import { createPreferencesService, type PreferencesService } from "./service/preferences.service";

let cached: PreferencesService | null = null;

export function getPreferencesService(): PreferencesService {
  if (cached) return cached;
  cached = createPreferencesService({
    repo: createDrizzlePreferencesRepository(db),
  });
  return cached;
}
