import { DomainError } from "@/lib/errors";
import type { SessionContext } from "@/lib/session";
import { isBackgroundToken, type UserPreferences } from "../domain/preferences";
import type { PreferencesRepository } from "../data/preferences.repository";

export interface PreferencesService {
  // As preferências do PRÓPRIO utilizador da sessão (self-service).
  get(session: SessionContext): Promise<UserPreferences>;
  setBackground(session: SessionContext, background: string): Promise<UserPreferences>;
}

export function createPreferencesService(deps: {
  repo: PreferencesRepository;
}): PreferencesService {
  const { repo } = deps;
  return {
    async get(session) {
      return repo.get(session.userId);
    },

    async setBackground(session, background) {
      // O token é validado contra a paleta declarada (fonte única no domínio).
      if (!isBackgroundToken(background)) {
        throw new DomainError("BAD_INPUT", "Fundo inválido", 400);
      }
      const current = await repo.get(session.userId);
      return repo.save(session.userId, { ...current, background });
    },
  };
}
