/* -------------------------------------------------------------------------- */
/*  Preferências pessoais — domínio (puro, sem I/O)                            */
/*                                                                            */
/*  O fundo do painel é uma "tela" ATRÁS dos cartões (os cartões têm fundo    */
/*  próprio, --wf-surface, e nunca mudam). Por isso a gama pode ir de branco  */
/*  a preto sem partir a legibilidade: só o texto que vive diretamente sobre  */
/*  a tela (o cabeçalho de página) acompanha a luminância, via CSS.           */
/* -------------------------------------------------------------------------- */

// Tokens de fundo, do mais claro (default) ao mais escuro.
export const BACKGROUND_TOKENS = [
  "default",
  "mist",
  "stone",
  "slate",
  "graphite",
  "coal",
] as const;

export type BackgroundToken = (typeof BACKGROUND_TOKENS)[number];

export const DEFAULT_BACKGROUND: BackgroundToken = "default";

// Preferências de um utilizador. Guardadas em users.preferences (jsonb).
export type UserPreferences = {
  background: BackgroundToken;
};

export const DEFAULT_PREFERENCES: UserPreferences = {
  background: DEFAULT_BACKGROUND,
};

// Paleta apresentável (rótulo PT + cor da amostra). Fonte única para a UI —
// a cor da amostra é a MESMA cor da tela aplicada no CSS por token.
export const BACKGROUND_SWATCHES: ReadonlyArray<{
  token: BackgroundToken;
  label: string;
  swatch: string;
}> = [
  { token: "default", label: "Claro", swatch: "#f4f6f4" },
  { token: "mist", label: "Névoa", swatch: "#e7ebe7" },
  { token: "stone", label: "Pedra", swatch: "#d2d8d2" },
  { token: "slate", label: "Ardósia", swatch: "#b3bbb4" },
  { token: "graphite", label: "Grafite", swatch: "#484d47" },
  { token: "coal", label: "Carvão", swatch: "#141614" },
];

export function isBackgroundToken(v: unknown): v is BackgroundToken {
  return typeof v === "string" && (BACKGROUND_TOKENS as readonly string[]).includes(v);
}

// Normaliza o jsonb livre (pode vir null, {}, ou com lixo) para preferências
// válidas, sempre com defaults seguros. Nunca lança.
export function normalizePreferences(raw: unknown): UserPreferences {
  const bg =
    raw && typeof raw === "object" && "background" in raw
      ? (raw as Record<string, unknown>).background
      : undefined;
  return { background: isBackgroundToken(bg) ? bg : DEFAULT_BACKGROUND };
}
