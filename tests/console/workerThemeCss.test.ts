import { describe, it, expect } from "vitest";
import { workerThemesCss } from "@/app/connections/workerThemeCss";
import { CONSOLE_THEME_TOKENS } from "@/modules/preferences/domain/preferences";
import { CONSOLE_THEMES } from "@/app/console/theme/consoleThemes";

describe("workerThemesCss — temas no painel do trabalhador", () => {
  const css = workerThemesCss();

  it("emite um bloco de acento por tema, scoped a .wf-app[data-theme]", () => {
    for (const t of CONSOLE_THEME_TOKENS) {
      expect(css).toContain(`.wf-app[data-theme="${t}"]`);
      // o acento do tema entra em --wf-green (a família de acento do painel)
      expect(css).toContain(`--wf-green: ${CONSOLE_THEMES[t].accent};`);
    }
  });

  it("em modo escuro troca também o fundo/painel pelo par dark do tema", () => {
    for (const t of CONSOLE_THEME_TOKENS) {
      expect(css).toContain(`.wf-app.wf-theme-dark[data-theme="${t}"]`);
      expect(css).toContain(`--wf-bg: ${CONSOLE_THEMES[t].bg};`);
      expect(css).toContain(`--wf-surface: ${CONSOLE_THEMES[t].panel};`);
    }
  });

  it("tints derivam de var(--wf-surface) → adaptam-se a claro/escuro", () => {
    // uma só regra por tema serve os dois modos (mix sobre a superfície corrente)
    expect(css).toMatch(/--wf-tint:\s*color-mix\(in srgb, [^,]+ 14%, var\(--wf-surface\)\)/);
  });

  it("Graphite (acento claro) usa texto escuro nas superfícies de acento", () => {
    expect(css).toContain('.wf-app[data-theme="graphite"] .wf-panel-link');
    expect(css).toContain("color: var(--wf-on-accent) !important");
  });

  it("interruptores/checkboxes nativos seguem o acento do tema", () => {
    expect(css).toContain('.wf-app[data-theme] input[type="checkbox"]');
    expect(css).toContain("accent-color: var(--wf-green)");
  });

  it("nunca toca na consola (.console) nem no :root", () => {
    expect(css).not.toMatch(/\.console\b/);
    expect(css).not.toMatch(/:root/);
  });
});
