import { describe, it, expect } from "vitest";
import {
  BACKGROUND_SWATCHES,
  BACKGROUND_TOKENS,
  DEFAULT_BACKGROUND,
  isBackgroundToken,
  normalizePreferences,
  type UserPreferences,
} from "@/modules/preferences/domain/preferences";
import {
  createPreferencesService,
  type PreferencesService,
} from "@/modules/preferences/service/preferences.service";
import type { PreferencesRepository } from "@/modules/preferences/data/preferences.repository";
import type { SessionContext } from "@/lib/session";

const worker: SessionContext = { userId: "u1", orgId: "o1", role: "worker" };

function fakeRepo(initial?: UserPreferences): PreferencesRepository & { peek(): UserPreferences } {
  let store: UserPreferences = initial ?? { background: DEFAULT_BACKGROUND };
  return {
    async get() {
      return { ...store };
    },
    async save(_userId, prefs) {
      store = { ...prefs };
      return { ...store };
    },
    peek() {
      return store;
    },
  };
}

describe("preferences — domínio", () => {
  it("a paleta apresentável cobre exatamente os tokens declarados", () => {
    const swatchTokens = BACKGROUND_SWATCHES.map((s) => s.token).sort();
    expect(swatchTokens).toEqual([...BACKGROUND_TOKENS].sort());
  });

  it("isBackgroundToken aceita tokens da paleta e rejeita o resto", () => {
    expect(isBackgroundToken("coal")).toBe(true);
    expect(isBackgroundToken("default")).toBe(true);
    expect(isBackgroundToken("neon")).toBe(false);
    expect(isBackgroundToken(123)).toBe(false);
    expect(isBackgroundToken(null)).toBe(false);
  });

  it("normalizePreferences cai em defaults seguros para jsonb livre/lixo", () => {
    expect(normalizePreferences(null).background).toBe("default");
    expect(normalizePreferences({}).background).toBe("default");
    expect(normalizePreferences({ background: "lixo" }).background).toBe("default");
    expect(normalizePreferences({ background: 7 }).background).toBe("default");
    expect(normalizePreferences({ background: "slate" }).background).toBe("slate");
  });
});

describe("preferences — serviço", () => {
  let svc: PreferencesService;
  let repo: ReturnType<typeof fakeRepo>;

  it("get devolve o default quando nada foi definido", async () => {
    repo = fakeRepo();
    svc = createPreferencesService({ repo });
    expect((await svc.get(worker)).background).toBe("default");
  });

  it("setBackground grava um token válido e persiste-o", async () => {
    repo = fakeRepo();
    svc = createPreferencesService({ repo });
    const out = await svc.setBackground(worker, "graphite");
    expect(out.background).toBe("graphite");
    expect(repo.peek().background).toBe("graphite");
  });

  it("setBackground rejeita um token fora da paleta (400) e não escreve", async () => {
    repo = fakeRepo({ background: "mist" });
    svc = createPreferencesService({ repo });
    await expect(svc.setBackground(worker, "neon")).rejects.toMatchObject({ status: 400 });
    expect(repo.peek().background).toBe("mist");
  });
});
