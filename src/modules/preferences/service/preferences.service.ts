import { DomainError, forbidden, notFound } from "@/lib/errors";
import type { SessionContext } from "@/lib/session";
import { isBackgroundToken, type UserPreferences } from "../domain/preferences";
import type { PreferencesRepository } from "../data/preferences.repository";

export interface PreferencesService {
  // As preferências do PRÓPRIO utilizador da sessão (self-service).
  get(session: SessionContext): Promise<UserPreferences>;
  setBackground(session: SessionContext, background: string): Promise<UserPreferences>;
  /**
   * Leitura admin (consola «Trabalhadores»): o fundo escolhido por um
   * trabalhador da org. Só super_admin; valida tenant. Só leitura — o admin
   * nunca altera as preferências de outro.
   */
  getForWorker(session: SessionContext, workerId: string): Promise<UserPreferences>;
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

    async getForWorker(session, workerId) {
      if (session.role !== "super_admin") {
        throw forbidden("Só o super-utilizador consulta as preferências de um trabalhador.");
      }
      // Isolamento tenant: notFound (não forbidden) para não revelar ids de outras orgs.
      if (!(await repo.workerInOrg(session.orgId, workerId))) {
        throw notFound("Trabalhador inexistente.", { workerId });
      }
      return repo.get(workerId);
    },
  };
}
