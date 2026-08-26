import { describe, it, expect } from "vitest";
import {
  CONSOLE_THEME_TOKENS,
  DEFAULT_CONSOLE_THEME,
  CONSOLE_THEME_OPTIONS,
  isConsoleTheme,
  normalizePreferences,
} from "@/modules/preferences/domain/preferences";
import {
  CONSOLE_THEMES,
  CSS_VAR_BY_TOKEN,
  consoleThemesCss,
  type ThemeTokenName,
} from "@/app/console/theme/consoleThemes";
import {
  createPreferencesService,
  type PreferencesService,
} from "@/modules/preferences/service/preferences.service";
import type { PreferencesRepository } from "@/modules/preferences/data/preferences.repository";
import { DEFAULT_PREFERENCES, type UserPreferences } from "@/modules/preferences/domain/preferences";
import type { SessionContext } from "@/lib/session";

const admin: SessionContext = { userId: "a1", orgId: "o1", role: "super_admin" };

function fakeRepo(
  initial?: Partial<UserPreferences>,
): PreferencesRepository & { peek(): UserPreferences } {
  let store: UserPreferences = { ...DEFAULT_PREFERENCES, ...initial };
  return {
    async get() {
      return { ...store };
    },
    async save(_userId, prefs) {
      store = { ...prefs };
      return { ...store };
    },
    async workerInOrg() {
      return false;
    },
    peek() {
      return store;
    },
  };
}

// Cor CSS aceite nos tokens: hex #rrggbb, rgba()/rgb(), "none", "currentColor"
// ou valores compostos (sombras/glows) que contenham uma destas. Estrito o
// suficiente para apanhar lixo, tolerante o suficiente para "0 0 7px currentColor".
const COLORISH = /#[0-9a-fA-F]{6}\b|rgba?\([^)]*\)|\bcurrentColor\b|\bnone\b/;

describe("consoleThemes — mapa de tokens", () => {
  it("existe exatamente um tema por chave do enum do domínio", () => {
    expect(Object.keys(CONSOLE_THEMES).sort()).toEqual([...CONSOLE_THEME_TOKENS].sort());
  });

  it("cada tema define TODAS as chaves de token (sem buracos)", () => {
    const expected = Object.keys(CSS_VAR_BY_TOKEN) as ThemeTokenName[];
    for (const theme of CONSOLE_THEME_TOKENS) {
      const tokens = CONSOLE_THEMES[theme];
      for (const key of expected) {
        expect(tokens[key], `${theme}.${key}`).toBeTruthy();
      }
      // e não define chaves a mais
      expect(Object.keys(tokens).sort()).toEqual([...expected].sort());
    }
  });

  it("os valores de cor são hex/rgba()/none/valores-CSS válidos", () => {
    for (const theme of CONSOLE_THEME_TOKENS) {
      const tokens = CONSOLE_THEMES[theme];
      // cores puras
      for (const key of ["bg", "panel", "panel2", "border", "text", "muted", "accent", "accent2", "accentFg", "success", "warning", "danger"] as ThemeTokenName[]) {
        expect(tokens[key], `${theme}.${key}`).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
      // valores compostos / com função
      for (const key of ["bgGlow", "dangerBg", "dotGlow", "cardShadow"] as ThemeTokenName[]) {
        expect(tokens[key], `${theme}.${key}`).toMatch(COLORISH);
      }
      // radius é um comprimento
      expect(tokens.radius, `${theme}.radius`).toMatch(/^\d+px$/);
    }
  });

  it("o default do enum é um tema conhecido", () => {
    expect(CONSOLE_THEME_TOKENS).toContain(DEFAULT_CONSOLE_THEME);
    expect(CONSOLE_THEMES[DEFAULT_CONSOLE_THEME]).toBeTruthy();
  });

  it("CONSOLE_THEME_OPTIONS cobre exatamente os tokens e o swatch é hex", () => {
    expect(CONSOLE_THEME_OPTIONS.map((o) => o.token).sort()).toEqual(
      [...CONSOLE_THEME_TOKENS].sort(),
    );
    for (const o of CONSOLE_THEME_OPTIONS) {
      expect(o.swatch, `${o.token}.swatch`).toMatch(/^#[0-9a-fA-F]{6}$/);
      // o swatch mostrado no seletor sai da paleta do tema: o acento, ou o
      // acento-2 quando o principal é quase-branco e ficaria invisível (Graphite).
      const t = CONSOLE_THEMES[o.token];
      const palette = [t.accent.toLowerCase(), t.accent2.toLowerCase()];
      expect(palette, `${o.token}.swatch`).toContain(o.swatch.toLowerCase());
      expect(o.label.length).toBeGreaterThan(0);
    }
  });
});

describe("consoleThemes — gerador de CSS", () => {
  const css = consoleThemesCss();

  it("emite um bloco scoped a .console[data-theme] por tema", () => {
    for (const theme of CONSOLE_THEME_TOKENS) {
      expect(css).toContain(`.console[data-theme="${theme}"]`);
    }
  });

  it("NUNCA usa :root nem .wf-app (isolamento da consola)", () => {
    expect(css).not.toMatch(/:root/);
    expect(css).not.toMatch(/\.wf-app/);
  });

  it("cada variável CSS mapeada aparece para cada tema (guarda de drift)", () => {
    for (const theme of CONSOLE_THEME_TOKENS) {
      const t = CONSOLE_THEMES[theme];
      // valores-âncora que a consola já consome
      expect(css).toContain(`${CSS_VAR_BY_TOKEN.accent}: ${t.accent};`);
      expect(css).toContain(`${CSS_VAR_BY_TOKEN.bg}: ${t.bg};`);
      expect(css).toContain(`${CSS_VAR_BY_TOKEN.panel}: ${t.panel};`);
    }
  });

  it("inclui a camada de fundo temada (glow) atrás do conteúdo", () => {
    expect(css).toContain(".console[data-theme]::before");
    expect(css).toContain("var(--bg-glow)");
    expect(css).toContain("z-index: -1");
  });

  it("liga as classes reais de estado/cartão aos tokens (fidelidade)", () => {
    // cantos + sombra por tema
    expect(css).toMatch(/\.console\[data-theme\][^{]*\.panel[^}]*border-radius:\s*var\(--radius\)/s);
    expect(css).toContain("box-shadow: var(--card-shadow)");
    // semáforo deixa de ser verde/âmbar fixos e passa a token
    expect(css).toContain(".status-green .readiness-dot { background: var(--success)");
    expect(css).toContain(".status-amber .readiness-dot { background: var(--warning)");
    // brilho dos pontos vivos + toggle nativo temado
    expect(css).toContain("box-shadow: var(--dot-glow)");
    expect(css).toContain("accent-color: var(--accent)");
    // as regras de fidelidade continuam scoped à consola
    const fidelityLines = css.split("\n").filter((l) => l.includes("readiness-dot"));
    for (const l of fidelityLines) expect(l).toContain(".console[data-theme]");
  });
});

describe("consoleTheme — validação e normalização", () => {
  it("isConsoleTheme aceita os 5 temas e rejeita o resto", () => {
    for (const theme of CONSOLE_THEME_TOKENS) expect(isConsoleTheme(theme)).toBe(true);
    expect(isConsoleTheme("neon")).toBe(false);
    expect(isConsoleTheme("EMBER")).toBe(false);
    expect(isConsoleTheme(7)).toBe(false);
    expect(isConsoleTheme(null)).toBe(false);
  });

  it("normalizePreferences cai no default para tema ausente/lixo", () => {
    expect(normalizePreferences(null).consoleTheme).toBe(DEFAULT_CONSOLE_THEME);
    expect(normalizePreferences({}).consoleTheme).toBe(DEFAULT_CONSOLE_THEME);
    expect(normalizePreferences({ consoleTheme: "lixo" }).consoleTheme).toBe(
      DEFAULT_CONSOLE_THEME,
    );
    expect(normalizePreferences({ consoleTheme: "voltage" }).consoleTheme).toBe("voltage");
  });
});

describe("preferences.setConsoleTheme — serviço", () => {
  let svc: PreferencesService;
  let repo: ReturnType<typeof fakeRepo>;

  it("grava um tema válido e persiste-o", async () => {
    repo = fakeRepo();
    svc = createPreferencesService({ repo });
    const out = await svc.setConsoleTheme(admin, "steel");
    expect(out.consoleTheme).toBe("steel");
    expect(repo.peek().consoleTheme).toBe("steel");
  });

  it("rejeita um tema fora do enum (400) e não escreve", async () => {
    repo = fakeRepo({ consoleTheme: "verdant" });
    svc = createPreferencesService({ repo });
    await expect(svc.setConsoleTheme(admin, "neon")).rejects.toMatchObject({ status: 400 });
    expect(repo.peek().consoleTheme).toBe("verdant");
  });

  it("preserva fundo/modo/fonte ao trocar de tema (merge no jsonb)", async () => {
    repo = fakeRepo({ background: "slate", mode: "dark", font: "archivo" });
    svc = createPreferencesService({ repo });
    const out = await svc.setConsoleTheme(admin, "voltage");
    expect(out.background).toBe("slate");
    expect(out.mode).toBe("dark");
    expect(out.font).toBe("archivo");
    expect(out.consoleTheme).toBe("voltage");
  });
});
