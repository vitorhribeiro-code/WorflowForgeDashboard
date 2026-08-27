// -----------------------------------------------------------------------------
//  Temas no PAINEL DO TRABALHADOR (.wf-app) — acento por tema, em claro E escuro
// -----------------------------------------------------------------------------
//  Decisão de arquitetura (aprovada): o tema é ORTOGONAL ao modo claro/escuro.
//   · O MODO (claro/escuro) continua a controlar as superfícies base (o sistema
//     `--wf-*` do globals.css fica INTOCADO — zero regressão nos dois modos).
//   · O TEMA só remapeia a família do ACENTO (`--wf-green*`, `--wf-tint*`) — que
//     serve para botões, nav ativa, pills, etc. As tints derivam por `color-mix`
//     sobre `var(--wf-surface)`, por isso ADAPTAM-SE sozinhas a claro/escuro.
//   · Em modo ESCURO, o tema aplica ainda o seu fundo/painel/linha (para ficar
//     fiel ao mock dark). Em modo CLARO, as superfícies claras mantêm-se.
//  Tudo scoped a `.wf-app[data-theme]` → nunca toca na consola (`.console`) nem
//  no `:root`. Gerado do mesmo mapa de tokens dos temas (fonte única).
// -----------------------------------------------------------------------------

import {
  CONSOLE_THEME_TOKENS,
  type ConsoleTheme,
} from "@/modules/preferences/domain/preferences";
import { CONSOLE_THEMES } from "@/app/console/theme/consoleThemes";

// Acento por tema no painel. Derivamos as sombras do acento com color-mix
// (uma expressão CSS, resolvida pelo browser) para não fazer matemática de cor
// em TS. `hero-1` fica um acento medio-escuro que serve de fim-de-gradiente
// (texto branco legível) E de texto sobre a tint (clara no claro, funda no
// escuro). `on-accent` é a tinta para superfícies de acento claras (Graphite).
function accentBlock(theme: ConsoleTheme): string {
  const t = CONSOLE_THEMES[theme];
  const a = t.accent;
  return `.wf-app[data-theme="${theme}"] {
  --wf-green: ${a};
  --wf-green-600: color-mix(in srgb, ${a} 82%, #000);
  --wf-green-hero-1: color-mix(in srgb, ${a} 65%, #000);
  --wf-green-hero-2: color-mix(in srgb, ${a} 52%, #000);
  --wf-tint: color-mix(in srgb, ${a} 14%, var(--wf-surface));
  --wf-tint2: color-mix(in srgb, ${a} 24%, var(--wf-surface));
  --wf-on-accent: ${t.accentFg};
}`;
}

// Em ESCURO, o tema também troca as superfícies base pelo seu par dark (fiel ao
// mock). Ink/muted herdam o dark base (já legíveis).
function darkSurfaceBlock(theme: ConsoleTheme): string {
  const t = CONSOLE_THEMES[theme];
  return `.wf-app.wf-theme-dark[data-theme="${theme}"] {
  --wf-bg: ${t.bg};
  --wf-surface: ${t.panel};
  --wf-line: ${t.border};
  --wf-line2: color-mix(in srgb, ${t.border} 72%, #000);
}`;
}

// Graphite: acento prateado (quase branco) → texto ESCURO nas superfícies de
// acento (botões/links/hero/logo/avatar), senão o branco herdado desaparece.
// Cobre os elementos que o globals.css pinta com `color:#fff` sobre acento.
const GRAPHITE_ON_ACCENT = `.wf-app[data-theme="graphite"] .wf-panel-link,
.wf-app[data-theme="graphite"] .btn-primary,
.wf-app[data-theme="graphite"] .wf-brand-mark,
.wf-app[data-theme="graphite"] .wf-who-av,
.wf-app[data-theme="graphite"] .wf-stat.wf-hero,
.wf-app[data-theme="graphite"] .wf-stat.wf-hero *,
.wf-app[data-theme="graphite"] .wf-tc--hero,
.wf-app[data-theme="graphite"] .wf-tc--hero * {
  color: var(--wf-on-accent) !important;
}`;

// Interruptores/checkboxes/radios nativos seguem o acento do tema (o pedido dos
// «interruptores fiéis ao mock»). Cobre `.assignment-toggle`, `.wf-mode-seg`
// (native? não — é botões, já segue via tints) e quaisquer inputs do painel.
const THEMED_CONTROLS = `.wf-app[data-theme] input[type="checkbox"],
.wf-app[data-theme] input[type="radio"],
.wf-app[data-theme] input[type="range"],
.wf-app[data-theme] progress {
  accent-color: var(--wf-green);
}`;

// CSS completo dos temas do painel. Injetado uma vez no shell do trabalhador.
// Determinístico e sem entrada do utilizador (valores só das constantes).
export function workerThemesCss(): string {
  const accents = CONSOLE_THEME_TOKENS.map(accentBlock).join("\n");
  const darks = CONSOLE_THEME_TOKENS.map(darkSurfaceBlock).join("\n");
  return `${accents}\n${darks}\n${GRAPHITE_ON_ACCENT}\n${THEMED_CONTROLS}\n`;
}
