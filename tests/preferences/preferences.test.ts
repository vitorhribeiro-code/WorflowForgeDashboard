import { describe, it, expect } from "vitest";
import {
  BACKGROUND_SWATCHES,
  BACKGROUND_TOKENS,
  DEFAULT_BACKGROUND,
  DEFAULT_MODE,
  MODE_OPTIONS,
  MODE_TOKENS,
  DEFAULT_CONSOLE_THEME,
  FONT_TOKENS,
  FONT_OPTIONS,
  DEFAULT_FONT,
  fontOptionFor,
  isFontToken,
  MAX_CUSTOM_BACKGROUND_BYTES,
  isBackgroundToken,
  isModeToken,
  isValidCustomBackground,
  isHexColor,
  normalizeCustomTokens,
  normalizePreferences,
  type UserPreferences,
} from "@/modules/preferences/domain/preferences";
import {
  analyzePixels,
  deriveAccent,
  deriveTokens,
  decideLitehdr,
  rgbToHsl,
  hslToRgb,
  relLuminance,
  toHex,
} from "@/app/connections/imageDownscale";
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
    font: DEFAULT_FONT,
    customBackground: null,
    customTokens: null,
    consoleTheme: DEFAULT_CONSOLE_THEME,
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

  it("FONT_OPTIONS cobre exatamente os tokens de fonte e só o default não tem href", () => {
    expect(FONT_OPTIONS.map((f) => f.token).sort()).toEqual([...FONT_TOKENS].sort());
    expect(fontOptionFor("default").href).toBeUndefined();
    // iA Writer Quattro é auto-alojada (SIL OFL) → sem href do Google.
    expect(fontOptionFor("iawriter").href).toBeUndefined();
    const selfHosted = new Set(["default", "iawriter"]);
    for (const f of FONT_OPTIONS) {
      if (!selfHosted.has(f.token))
        expect(f.href).toMatch(/^https:\/\/fonts\.googleapis\.com\//);
    }
  });

  it("isFontToken aceita a lista curada e rejeita o resto", () => {
    expect(isFontToken("fraunces")).toBe(true);
    expect(isFontToken("default")).toBe(true);
    expect(isFontToken("comic-sans")).toBe(false);
    expect(isFontToken(42)).toBe(false);
  });

  it("fontOptionFor cai no default para um token desconhecido", () => {
    expect(fontOptionFor("xpto" as never).token).toBe("default");
  });

  it("normalizePreferences resolve a fonte com default seguro", () => {
    expect(normalizePreferences(null).font).toBe("default");
    expect(normalizePreferences({ font: "lixo" }).font).toBe("default");
    expect(normalizePreferences({ font: "outfit" }).font).toBe("outfit");
  });

  it("normalizePreferences resolve o modo com default seguro", () => {
    expect(normalizePreferences(null).mode).toBe("light");
    expect(normalizePreferences({}).mode).toBe("light");
    expect(normalizePreferences({ mode: "lixo" }).mode).toBe("light");
    expect(normalizePreferences({ mode: "dark" }).mode).toBe("dark");
    expect(normalizePreferences({ background: "slate", mode: "dark" })).toEqual({
      background: "slate",
      mode: "dark",
      font: "default",
      customBackground: null,
      customTokens: null,
      consoleTheme: "ember",
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
    ).toEqual({
      background: "custom",
      mode: "light",
      font: "default",
      customBackground: SMALL_WEBP,
      customTokens: null,
      consoleTheme: "ember",
    });
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

  it("setFont grava uma fonte válida e persiste-a", async () => {
    repo = fakeRepo();
    svc = createPreferencesService({ repo });
    const out = await svc.setFont(worker, "fraunces");
    expect(out.font).toBe("fraunces");
    expect(repo.peek().font).toBe("fraunces");
  });

  it("setFont rejeita uma fonte fora da lista (400) e não escreve", async () => {
    repo = fakeRepo({ font: "outfit" });
    svc = createPreferencesService({ repo });
    await expect(svc.setFont(worker, "papyrus")).rejects.toMatchObject({ status: 400 });
    expect(repo.peek().font).toBe("outfit");
  });

  it("setFont preserva fundo e modo (merge no jsonb)", async () => {
    repo = fakeRepo({ background: "slate", mode: "dark" });
    svc = createPreferencesService({ repo });
    const out = await svc.setFont(worker, "archivo");
    expect(out.background).toBe("slate");
    expect(out.mode).toBe("dark");
    expect(out.font).toBe("archivo");
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

  it("setCustomBackground guarda os tokens derivados (normalizados)", async () => {
    repo = fakeRepo();
    svc = createPreferencesService({ repo });
    const out = await svc.setCustomBackground(worker, SMALL_WEBP, {
      accentLight: "#1F9D55",
      accentDark: "#35c56e",
      litehdr: true,
    });
    expect(out.customTokens).toEqual({
      accentLight: "#1f9d55",
      accentDark: "#35c56e",
      litehdr: true,
    });
  });

  it("setCustomBackground descarta tokens com hex inválido", async () => {
    repo = fakeRepo();
    svc = createPreferencesService({ repo });
    const out = await svc.setCustomBackground(worker, SMALL_WEBP, {
      accentLight: "red;}evil",
      accentDark: null,
      litehdr: false,
    });
    expect(out.customTokens).toBeNull();
  });

  it("setCustomBackground(null) limpa também os tokens", async () => {
    repo = fakeRepo({
      background: "custom",
      customBackground: SMALL_WEBP,
      customTokens: { accentLight: "#1f9d55", accentDark: "#35c56e", litehdr: true },
    });
    svc = createPreferencesService({ repo });
    const out = await svc.setCustomBackground(worker, null);
    expect(out.customTokens).toBeNull();
    expect(out.customBackground).toBeNull();
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

  it("admin não recebe bytes nem tokens do fundo personalizado", async () => {
    const repo = fakeRepo({
      background: "custom",
      customBackground: SMALL_WEBP,
      customTokens: { accentLight: "#1f9d55", accentDark: "#35c56e", litehdr: true },
    });
    repo.membership.add("o1:u1");
    const svc = createPreferencesService({ repo });
    const out = await svc.getForWorker(admin, "u1");
    expect(out.background).toBe("custom"); // rótulo "Personalizado"
    expect(out.customBackground).toBeNull();
    expect(out.customTokens).toBeNull();
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

/* -------------------------------------------------------------------------- */
/*  Fase das cores automáticas                                                */
/* -------------------------------------------------------------------------- */

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function contrast(hex: string, otherLum: number): number {
  const [r, g, b] = hexToRgb(hex);
  const l = relLuminance(r, g, b);
  const hi = Math.max(l, otherLum);
  const lo = Math.min(l, otherLum);
  return (hi + 0.05) / (lo + 0.05);
}
function fill(w: number, h: number, rgb: [number, number, number]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = rgb[0];
    data[i * 4 + 1] = rgb[1];
    data[i * 4 + 2] = rgb[2];
    data[i * 4 + 3] = 255;
  }
  return data;
}
const DARK_SURFACE_LUM = relLuminance(26, 34, 29);

describe("preferences — tokens derivados (domínio)", () => {
  it("isHexColor só aceita #rrggbb canónico", () => {
    expect(isHexColor("#1f9d55")).toBe(true);
    expect(isHexColor("#ABCDEF")).toBe(true);
    expect(isHexColor("#fff")).toBe(false); // curto
    expect(isHexColor("1f9d55")).toBe(false); // sem #
    expect(isHexColor("#1f9d5")).toBe(false);
    expect(isHexColor("red")).toBe(false);
    expect(isHexColor("#1f9d55;}x")).toBe(false); // tentativa de injeção
    expect(isHexColor(123)).toBe(false);
    expect(isHexColor(null)).toBe(false);
  });

  it("normalizeCustomTokens valida hex, aceita null e descarta lixo", () => {
    expect(
      normalizeCustomTokens({ accentLight: "#1F9D55", accentDark: "#35c56e", litehdr: true }),
    ).toEqual({ accentLight: "#1f9d55", accentDark: "#35c56e", litehdr: true });
    // accent inválido → null, mas litehdr mantém o objeto vivo
    expect(
      normalizeCustomTokens({ accentLight: "vermelho", accentDark: null, litehdr: true }),
    ).toEqual({ accentLight: null, accentDark: null, litehdr: true });
    // nada de útil → null
    expect(normalizeCustomTokens({ accentLight: "x", litehdr: false })).toBeNull();
    expect(normalizeCustomTokens(null)).toBeNull();
    expect(normalizeCustomTokens("olá")).toBeNull();
  });

  it("normalizePreferences só mantém tokens quando há imagem válida", () => {
    // sem imagem → tokens caem para null (coerência)
    expect(
      normalizePreferences({ customTokens: { accentLight: "#1f9d55", litehdr: true } })
        .customTokens,
    ).toBeNull();
    // com imagem → tokens sobrevivem
    expect(
      normalizePreferences({
        background: "custom",
        customBackground: SMALL_WEBP,
        customTokens: { accentLight: "#1f9d55", accentDark: "#35c56e", litehdr: false },
      }).customTokens,
    ).toEqual({ accentLight: "#1f9d55", accentDark: "#35c56e", litehdr: false });
  });
});

describe("cores automáticas — matemática pura", () => {
  it("rgbToHsl/hslToRgb fecham o ciclo em cores base", () => {
    expect(rgbToHsl(255, 0, 0)[0]).toBeCloseTo(0, 0);
    expect(rgbToHsl(0, 0, 255)[0]).toBeCloseTo(240, 0);
    expect(hslToRgb(0, 1, 0.5)).toEqual([255, 0, 0]);
    expect(hslToRgb(240, 1, 0.5)).toEqual([0, 0, 255]);
    // cinzento → saturação 0
    expect(rgbToHsl(128, 128, 128)[1]).toBe(0);
  });

  it("relLuminance ordena branco > cinzento > preto", () => {
    expect(relLuminance(255, 255, 255)).toBeCloseTo(1, 5);
    expect(relLuminance(0, 0, 0)).toBeCloseTo(0, 5);
    expect(relLuminance(255, 255, 255)).toBeGreaterThan(relLuminance(128, 128, 128));
    expect(relLuminance(128, 128, 128)).toBeGreaterThan(relLuminance(0, 0, 0));
  });

  it("toHex formata e clampa", () => {
    expect(toHex([255, 0, 0])).toBe("#ff0000");
    expect(toHex([31, 157, 85])).toBe("#1f9d55");
    expect(toHex([300, -5, 10])).toBe("#ff000a");
  });

  it("deriveAccent devolve null para quase-cinzenta", () => {
    expect(deriveAccent(210, 0.05)).toEqual({ light: null, dark: null });
  });

  it("deriveAccent respeita as guardas de contraste (azul)", () => {
    const a = deriveAccent(220, 0.7);
    expect(a.light).not.toBeNull();
    expect(a.dark).not.toBeNull();
    // claro: texto branco por cima → contraste com o branco >= ~3 (folga p/ passo)
    expect(contrast(a.light as string, relLuminance(255, 255, 255))).toBeGreaterThanOrEqual(2.9);
    // escuro: cor viva sobre a superfície escura → contraste >= ~3.5
    expect(contrast(a.dark as string, DARK_SURFACE_LUM)).toBeGreaterThanOrEqual(3.4);
  });

  it("deriveAccent escurece amarelos (claros) para contrastar com o branco", () => {
    const a = deriveAccent(55, 0.9);
    expect(contrast(a.light as string, relLuminance(255, 255, 255))).toBeGreaterThanOrEqual(2.9);
  });

  it("decideLitehdr: topo escuro pede tinta clara, topo claro não", () => {
    expect(decideLitehdr(0.03)).toBe(true);
    expect(decideLitehdr(0.9)).toBe(false);
  });

  it("analyzePixels extrai matiz/saturação e luminância do topo", () => {
    const blue = analyzePixels(fill(4, 4, [0, 0, 255]), 4, 4);
    expect(blue.hue).toBeCloseTo(240, 0);
    expect(blue.sat).toBeGreaterThan(0.9);
    const grey = analyzePixels(fill(4, 4, [128, 128, 128]), 4, 4);
    expect(grey.sat).toBeLessThan(0.1);
  });

  it("deriveTokens: imagem azul-escura → acento + cabeçalho claro", () => {
    const t = deriveTokens(analyzePixels(fill(6, 6, [10, 20, 90]), 6, 6));
    expect(t.accentLight).not.toBeNull();
    expect(t.litehdr).toBe(true);
  });
});
