// -----------------------------------------------------------------------------
//  Temas de cor da CONSOLA (5 variações «Forge») — fonte de verdade dos VALORES
// -----------------------------------------------------------------------------
//  As CHAVES (enum) vivem no domínio das preferências (uma só fonte, partilhada
//  com a validação do serviço). Aqui vive o MAPA de tokens de cada tema e o
//  gerador do CSS. O CSS é injetado (server) no layout da consola, scoped a
//  `.console[data-theme="…"]` — nunca `:root`/`<html>` nem `.wf-app`, para o
//  tema afetar SÓ a consola e não vazar para o painel do trabalhador.
//
//  Nota de arquitetura: a consola já consome os 9 tokens base existentes
//  (--bg, --panel, --border, --text, --muted, --accent, --accent-fg, --danger,
//  --danger-bg) definidos no `:root` do globals.css. Remapeá-los por tema
//  re-skina toda a consola sem CSS estrutural novo. Os tokens extra
//  (--panel-2, --accent-2, --success, --warning, --bg-glow, --radius,
//  --dot-glow, --card-shadow) ficam disponíveis para polimento futuro; hoje só
//  --bg-glow/--bg são usados pela camada de brilho ambiente (ver consoleThemesCss).
// -----------------------------------------------------------------------------

import {
  CONSOLE_THEME_TOKENS,
  type ConsoleTheme,
} from "@/modules/preferences/domain/preferences";

// Nomes dos tokens de cada tema. O mapeamento para as variáveis CSS reais está
// em CSS_VAR_BY_TOKEN (abaixo). São todos strings (hex, rgba() ou valores CSS
// como "14px" / "0 0 7px currentColor" / "none").
export type ThemeTokens = {
  bg: string;
  shell: string;
  bgGlow: string;
  panel: string;
  panel2: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  accent2: string;
  accentFg: string;
  success: string;
  warning: string;
  danger: string;
  dangerBg: string;
  radius: string;
  dotGlow: string;
  cardShadow: string;
};

export type ThemeTokenName = keyof ThemeTokens;

// Token → variável CSS que a consola (já) consome ou que fica disponível.
export const CSS_VAR_BY_TOKEN: Record<ThemeTokenName, string> = {
  bg: "--bg",
  shell: "--shell",
  bgGlow: "--bg-glow",
  panel: "--panel",
  panel2: "--panel-2",
  border: "--border",
  text: "--text",
  muted: "--muted",
  accent: "--accent",
  accent2: "--accent-2",
  accentFg: "--accent-fg",
  success: "--success",
  warning: "--warning",
  danger: "--danger",
  dangerBg: "--danger-bg",
  radius: "--radius",
  dotGlow: "--dot-glow",
  cardShadow: "--card-shadow",
};

export const CONSOLE_THEMES: Record<ConsoleTheme, ThemeTokens> = {
  // 1 · EMBER — âmbar-fundido, o forge original (evolução direta da consola).
  ember: {
    bg: "#0a090d",
    shell: "#100f14",
    bgGlow: "rgba(255,122,60,.14)",
    panel: "#17161f",
    panel2: "#1c1f2a",
    border: "#232130",
    text: "#ece9f0",
    muted: "#8b8798",
    accent: "#ff7a3c",
    accent2: "#ffb066",
    accentFg: "#1a0d06",
    success: "#37c893",
    warning: "#f6b545",
    danger: "#ff5d63",
    dangerBg: "rgba(255,93,99,.14)",
    radius: "14px",
    dotGlow: "0 0 7px currentColor",
    cardShadow: "none",
  },
  // 2 · STEEL — aço frio, azul-cyan, cantos rentes, sem brilho.
  steel: {
    bg: "#0b0f15",
    shell: "#0d1119",
    bgGlow: "rgba(56,160,240,.13)",
    panel: "#111721",
    panel2: "#141b27",
    border: "#213042",
    text: "#e6ecf3",
    muted: "#8494a6",
    accent: "#3aa0f0",
    accent2: "#7fd0ff",
    accentFg: "#04121f",
    success: "#33c8a3",
    warning: "#efb64c",
    danger: "#ff6472",
    dangerBg: "rgba(255,100,114,.14)",
    radius: "9px",
    dotGlow: "none",
    cardShadow: "none",
  },
  // 3 · GRAPHITE — monocromático, acento prateado, minimalismo à «geist».
  graphite: {
    bg: "#0e0e10",
    shell: "#111113",
    bgGlow: "rgba(255,255,255,.045)",
    panel: "#17171a",
    panel2: "#1b1b1f",
    border: "#2a2a30",
    text: "#ededee",
    muted: "#8a8a92",
    accent: "#e7e7ea",
    accent2: "#c0c0c6",
    accentFg: "#111113",
    success: "#86c39a",
    warning: "#cbb06a",
    danger: "#e08a8a",
    dangerBg: "rgba(224,138,138,.14)",
    radius: "12px",
    dotGlow: "none",
    cardShadow: "none",
  },
  // 4 · VOLTAGE — preto profundo + violeta elétrico, brilho e sombra colorida.
  voltage: {
    bg: "#08080c",
    shell: "#0d0b13",
    bgGlow: "rgba(124,92,255,.20)",
    panel: "#121019",
    panel2: "#17141f",
    border: "#282338",
    text: "#eceaf4",
    muted: "#8d89a0",
    accent: "#8b5cff",
    accent2: "#b79bff",
    accentFg: "#0a0713",
    success: "#3ee0a0",
    warning: "#ffcf5c",
    danger: "#ff6b8a",
    dangerBg: "rgba(255,107,138,.14)",
    radius: "16px",
    dotGlow: "0 0 9px currentColor",
    cardShadow: "0 18px 46px -34px rgba(124,92,255,.6)",
  },
  // 5 · VERDANT — escuro esverdeado + esmeralda, calmo e natural.
  verdant: {
    bg: "#0b1210",
    shell: "#0e1512",
    bgGlow: "rgba(52,200,140,.13)",
    panel: "#121a16",
    panel2: "#16211b",
    border: "#22322a",
    text: "#e6efe9",
    muted: "#849990",
    accent: "#35c88a",
    accent2: "#7fe0b6",
    accentFg: "#04140d",
    success: "#4fd6a0",
    warning: "#e5b85a",
    danger: "#ff6b6b",
    dangerBg: "rgba(255,107,107,.14)",
    radius: "14px",
    dotGlow: "0 0 6px currentColor",
    cardShadow: "none",
  },
};

// Bloco de declarações de um tema (as ~17 variáveis CSS).
function themeVars(theme: ConsoleTheme): string {
  const t = CONSOLE_THEMES[theme];
  const lines = (Object.keys(CSS_VAR_BY_TOKEN) as ThemeTokenName[])
    .map((name) => `  ${CSS_VAR_BY_TOKEN[name]}: ${t[name]};`)
    .join("\n");
  return `.console[data-theme="${theme}"] {\n  color-scheme: dark;\n${lines}\n}`;
}

// Camada de fundo temada: cobre a viewport inteira (o `.console` é uma coluna
// centrada e não pinta fundo próprio). z-index:-1 → atrás do conteúdo, à frente
// do fundo do body (`:root`). Só aparece quando há data-theme.
const GLOW_LAYER = `.console[data-theme]::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  /* Redesign: fundo liso (sem radial), como o estudo. --bg-glow fica disponível
     para quem quiser repor o brilho por tema. */
  background: var(--bg);
}`;

// Regras de FIDELIDADE: ligam as classes reais da consola aos tokens do tema,
// para cada tema ficar fiel ao mock (cantos, sombra, cores de estado, brilho
// dos pontos) — e não só o acento/fundo. Tudo scoped a `.console[data-theme]`:
//  · o fallback `:root` (sem data-theme) fica INTOCADO;
//  · a especificidade (0,4,0+) bate as regras hardcoded do globals.css
//    (`.status-green .readiness-dot{background:#7ee08a}`, etc.), sem as editar.
// É theme-agnóstico (usa var(--…)); os valores variam por bloco de tema acima.
const FIDELITY = `
/* cantos e sombra por tema nos contentores-cartão */
.console[data-theme] .console-card,
.console[data-theme] .panel {
  border-radius: var(--radius);
  box-shadow: var(--card-shadow);
}
.console[data-theme] .console-card:hover {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
}
/* checkbox nativo do toggle da matriz ganha a cor do tema */
.console[data-theme] input[type="checkbox"],
.console[data-theme] input[type="radio"],
.console[data-theme] .matrix-toggle input { accent-color: var(--accent); }
/* semáforo (readiness) segue a paleta do tema, com brilho nos estados vivos */
.console[data-theme] .status-green .readiness-dot { background: var(--success); box-shadow: var(--dot-glow); }
.console[data-theme] .status-amber .readiness-dot { background: var(--warning); }
.console[data-theme] .status-red .readiness-dot { box-shadow: var(--dot-glow); }
/* pills e textos de estado seguem os tokens (verde/âmbar deixam de ser fixos) */
.console[data-theme] .status-pill.status-green,
.console[data-theme] .task-ok { color: var(--success); }
.console[data-theme] .status-pill.status-amber { color: var(--warning); }
.console[data-theme] .status-pill { background: color-mix(in srgb, currentColor 10%, transparent); }
`;

// CSS completo dos 5 temas + camada de brilho + fidelidade. Injetado uma vez no
// server (layout da consola). Determinístico e sem entrada do utilizador — os
// valores vêm só destas constantes.
export function consoleThemesCss(): string {
  const blocks = CONSOLE_THEME_TOKENS.map((t) => themeVars(t)).join("\n");
  return `${blocks}\n${GLOW_LAYER}\n${FIDELITY}`;
}
