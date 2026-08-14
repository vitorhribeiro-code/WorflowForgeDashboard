import { describe, it, expect } from "vitest";
import {
  BACKGROUND_SWATCHES,
  BACKGROUND_TOKENS,
  DEFAULT_BACKGROUND,
  DEFAULT_MODE,
  MODE_OPTIONS,
  MODE_TOKENS,
  MAX_CUSTOM_BACKGROUND_BYTES,
  isBackgroundToken,
  isModeToken,
  isValidCustomBackground,
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

// Data URL WebP mínimo mas com envelope válido (o validador não descodifica a
// imagem — só valida prefixo + base64 + tamanho).
const SMALL_WEBP = "data:image/webp;base64,AAAA";

function fakeRepo(
  initial?: Partial<UserPreferences>,
): PreferencesRepository & { peek(): UserPreferences; membership: Set<string> } {
  let store: UserPreferences = {
    background: DEFAULT_BACKGROUND,
    mode: DEFAULT_MODE,
    customBackground: null,
    ...initial,
  };
  const membership = new Set<string>();
  return {
    async get() {
      return { ...store };
    },
    async save(_userId, prefs) {
      store = { ...prefs };
      return { ...store };
    },
    async workerInOrg(orgId, workerId) {
      return membership.has(`${orgId}:${workerId}`);
    },
    membership,
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

  it("MODE_OPTIONS cobre exatamente os modos declarados", () => {
    expect(MODE_OPTIONS.map((m) => m.token).sort()).toEqual([...MODE_TOKENS].sort());
  });

  it("isModeToken aceita 'light'/'dark' e rejeita o resto", () => {
    expect(isModeToken("light")).toBe(true);
    expect(isModeToken("dark")).toBe(true);
    expect(isModeToken("cinza")).toBe(false);
    expect(isModeToken(0)).toBe(false);
    expect(isModeToken(null)).toBe(false);
  });

  it("normalizePreferences resolve o modo com default seguro", () => {
    expect(normalizePreferences(null).mode).toBe("light");
    expect(normalizePreferences({}).mode).toBe("light");
    expect(normalizePreferences({ mode: "lixo" }).mode).toBe("light");
    expect(normalizePreferences({ mode: "dark" }).mode).toBe("dark");
    expect(normalizePreferences({ background: "slate", mode: "dark" })).toEqual({
      background: "slate",
      mode: "dark",
      customBackground: null,
    });
  });

  it("isValidCustomBackground só aceita data URL WebP dentro do teto", () => {
    expect(isValidCustomBackground(SMALL_WEBP)).toBe(true);
    // mime errado
    expect(isValidCustomBackground("data:image/png;base64,AAAA")).toBe(false);
    // base64 malformado (não múltiplo de 4)
    expect(isValidCustomBackground("data:image/webp;base64,AAA")).toBe(false);
    // não é data URL
    expect(isValidCustomBackground("olá")).toBe(false);
    expect(isValidCustomBackground(123)).toBe(false);
    expect(isValidCustomBackground(null)).toBe(false);
    // acima do teto (base64 decodifica a ~3/4 do comprimento, logo 2·MAX chars
    // → ~1.5·MAX bytes, garantidamente acima do teto)
    const tooBig = "data:image/webp;base64," + "A".repeat(MAX_CUSTOM_BACKGROUND_BYTES * 2);
    expect(isValidCustomBackground(tooBig)).toBe(false);
  });

  it("normalizePreferences resolve o fundo personalizado e a sua coerência", () => {
    expect(normalizePreferences({}).customBackground).toBeNull();
    expect(normalizePreferences({ customBackground: SMALL_WEBP }).customBackground).toBe(
      SMALL_WEBP,
    );
    // lixo em customBackground cai em null
    expect(
      normalizePreferences({ customBackground: "data:image/png;base64,AAAA" }).customBackground,
    ).toBeNull();
    // "custom" SEM imagem válida → volta ao default (guarda de coerência)
    expect(normalizePreferences({ background: "custom" }).background).toBe("default");
    // "custom" COM imagem válida → mantém-se
    expect(
      normalizePreferences({ background: "custom", customBackground: SMALL_WEBP }),
    ).toEqual({ background: "custom", mode: "light", customBackground: SMALL_WEBP });
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

  it("setMode grava um modo válido e persiste-o", async () => {
    repo = fakeRepo();
    svc = createPreferencesService({ repo });
    const out = await svc.setMode(worker, "dark");
    expect(out.mode).toBe("dark");
    expect(repo.peek().mode).toBe("dark");
  });

  it("setMode rejeita um modo inválido (400) e não escreve", async () => {
    repo = fakeRepo({ mode: "dark" });
    svc = createPreferencesService({ repo });
    await expect(svc.setMode(worker, "sepia")).rejects.toMatchObject({ status: 400 });
    expect(repo.peek().mode).toBe("dark");
  });

  it("setMode preserva o fundo já escolhido (merge no jsonb)", async () => {
    repo = fakeRepo({ background: "graphite" });
    svc = createPreferencesService({ repo });
    const out = await svc.setMode(worker, "dark");
    expect(out.background).toBe("graphite");
    expect(out.mode).toBe("dark");
  });

  it("setCustomBackground grava a imagem e seleciona o fundo custom", async () => {
    repo = fakeRepo();
    svc = createPreferencesService({ repo });
    const out = await svc.setCustomBackground(worker, SMALL_WEBP);
    expect(out.customBackground).toBe(SMALL_WEBP);
    expect(out.background).toBe("custom");
  });

  it("setCustomBackground rejeita imagem inválida (400) e não escreve", async () => {
    repo = fakeRepo({ background: "mist" });
    svc = createPreferencesService({ repo });
    await expect(
      svc.setCustomBackground(worker, "data:image/png;base64,AAAA"),
    ).rejects.toMatchObject({ status: 400 });
    expect(repo.peek().background).toBe("mist");
    expect(repo.peek().customBackground).toBeNull();
  });

  it("setCustomBackground(null) limpa os bytes e, se estava em custom, volta ao default", async () => {
    repo = fakeRepo({ background: "custom", customBackground: SMALL_WEBP });
    svc = createPreferencesService({ repo });
    const out = await svc.setCustomBackground(worker, null);
    expect(out.customBackground).toBeNull();
    expect(out.background).toBe("default");
  });

  it("setCustomBackground(null) preserva um fundo NÃO-custom", async () => {
    repo = fakeRepo({ background: "slate", customBackground: SMALL_WEBP });
    svc = createPreferencesService({ repo });
    const out = await svc.setCustomBackground(worker, null);
    expect(out.background).toBe("slate");
    expect(out.customBackground).toBeNull();
  });

  it("setCustomBackground preserva o modo (merge no jsonb)", async () => {
    repo = fakeRepo({ mode: "dark" });
    svc = createPreferencesService({ repo });
    const out = await svc.setCustomBackground(worker, SMALL_WEBP);
    expect(out.mode).toBe("dark");
  });

  it("setBackground('custom') sem imagem é rejeitado (400)", async () => {
    repo = fakeRepo();
    svc = createPreferencesService({ repo });
    await expect(svc.setBackground(worker, "custom")).rejects.toMatchObject({ status: 400 });
  });

  it("setBackground('custom') com imagem guardada é aceite", async () => {
    repo = fakeRepo({ customBackground: SMALL_WEBP });
    svc = createPreferencesService({ repo });
    const out = await svc.setBackground(worker, "custom");
    expect(out.background).toBe("custom");
  });
});

describe("preferences — getForWorker (leitura admin)", () => {
  const admin: SessionContext = { userId: "a1", orgId: "o1", role: "super_admin" };

  it("admin lê o fundo de um worker da sua org", async () => {
    const repo = fakeRepo({ background: "graphite" });
    repo.membership.add("o1:u1");
    const svc = createPreferencesService({ repo });
    expect((await svc.getForWorker(admin, "u1")).background).toBe("graphite");
  });

  it("bloqueia o worker (não é leitura de worker)", async () => {
    const repo = fakeRepo();
    repo.membership.add("o1:u1");
    const svc = createPreferencesService({ repo });
    await expect(svc.getForWorker(worker, "u1")).rejects.toMatchObject({ code: "forbidden" });
  });

  it("nega (not_found) um worker fora da org do admin — isolamento tenant", async () => {
    const repo = fakeRepo();
    const svc = createPreferencesService({ repo });
    await expect(svc.getForWorker(admin, "intruso")).rejects.toMatchObject({
      code: "not_found",
    });
  });
});
