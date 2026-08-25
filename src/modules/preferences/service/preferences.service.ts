import { DomainError, forbidden, notFound } from "@/lib/errors";
import type { SessionContext } from "@/lib/session";
import {
  DEFAULT_BACKGROUND,
  isBackgroundToken,
  isModeToken,
  isFontToken,
  isConsoleTheme,
  isValidCustomBackground,
  normalizeCustomTokens,
  type CustomTokens,
  type UserPreferences,
} from "../domain/preferences";
import type { PreferencesRepository } from "../data/preferences.repository";

export interface PreferencesService {
  // As preferências do PRÓPRIO utilizador da sessão (self-service).
  get(session: SessionContext): Promise<UserPreferences>;
  setBackground(session: SessionContext, background: string): Promise<UserPreferences>;
  setMode(session: SessionContext, mode: string): Promise<UserPreferences>;
  setFont(session: SessionContext, font: string): Promise<UserPreferences>;
  /** Define o tema de cor da consola do próprio utilizador. */
  setConsoleTheme(session: SessionContext, theme: string): Promise<UserPreferences>;
  /**
   * Define (string data URL) ou limpa (null) a imagem de fundo personalizada do
   * próprio utilizador. Definir seleciona automaticamente o fundo "custom";
   * limpar, se estava em custom, volta ao fundo default.
   */
  setCustomBackground(
    session: SessionContext,
    value: string | null,
    tokens?: unknown,
  ): Promise<UserPreferences>;
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
      // Não se aplica "custom" sem uma imagem válida guardada.
      if (background === "custom" && !isValidCustomBackground(current.customBackground)) {
        throw new DomainError("BAD_INPUT", "Sem imagem personalizada para aplicar", 400);
      }
      return repo.save(session.userId, { ...current, background });
    },

    async setCustomBackground(session, value, tokens) {
      const current = await repo.get(session.userId);
      if (value === null) {
        // Limpar: remove os bytes E os tokens; se estava em custom, cai no default.
        const background =
          current.background === "custom" ? DEFAULT_BACKGROUND : current.background;
        return repo.save(session.userId, {
          ...current,
          customBackground: null,
          customTokens: null,
          background,
        });
      }
      if (!isValidCustomBackground(value)) {
        throw new DomainError("BAD_INPUT", "Imagem de fundo inválida", 400);
      }
      // Tokens derivados são opcionais e normalizados no servidor (defesa —
      // hex canónico ou descartados). Definir a imagem seleciona o fundo
      // personalizado num só PUT.
      const customTokens: CustomTokens | null = normalizeCustomTokens(tokens);
      return repo.save(session.userId, {
        ...current,
        customBackground: value,
        customTokens,
        background: "custom",
      });
    },

    async setMode(session, mode) {
      // Validado contra os modos declarados (fonte única no domínio).
      if (!isModeToken(mode)) {
        throw new DomainError("BAD_INPUT", "Modo inválido", 400);
      }
      const current = await repo.get(session.userId);
      return repo.save(session.userId, { ...current, mode });
    },

    async setFont(session, font) {
      // Validado contra a lista curada (fonte única no domínio).
      if (!isFontToken(font)) {
        throw new DomainError("BAD_INPUT", "Fonte inválida", 400);
      }
      const current = await repo.get(session.userId);
      return repo.save(session.userId, { ...current, font });
    },

    async setConsoleTheme(session, theme) {
      // Validado contra o enum de temas da consola (fonte única no domínio).
      if (!isConsoleTheme(theme)) {
        throw new DomainError("BAD_INPUT", "Tema inválido", 400);
      }
      const current = await repo.get(session.userId);
      return repo.save(session.userId, { ...current, consoleTheme: theme });
    },

    async getForWorker(session, workerId) {
      if (session.role !== "super_admin") {
        throw forbidden("Só o super-utilizador consulta as preferências de um trabalhador.");
      }
      // Isolamento tenant: notFound (não forbidden) para não revelar ids de outras orgs.
      if (!(await repo.workerInOrg(session.orgId, workerId))) {
        throw notFound("Trabalhador inexistente.", { workerId });
      }
      // O admin vê o rótulo (background === "custom" → "Personalizado"), nunca os
      // bytes da imagem do trabalhador — projeção enxuta e sem dados pessoais.
      const prefs = await repo.get(workerId);
      return { ...prefs, customBackground: null, customTokens: null };
    },
  };
}
