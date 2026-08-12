/* -------------------------------------------------------------------------- */
/*  Preferências pessoais — domínio (puro, sem I/O)                            */
/*                                                                            */
/*  O fundo do painel é uma "tela" ATRÁS dos cartões (os cartões têm fundo    */
/*  próprio, --wf-surface, e nunca mudam). Por isso a gama pode ir de branco  */
/*  a preto sem partir a legibilidade: só o texto que vive diretamente sobre  */
/*  a tela (o cabeçalho de página) acompanha a luminância, via CSS.           */
/* -------------------------------------------------------------------------- */

// Tokens de fundo. Primeiro a rampa de cor (do mais claro ao mais escuro),
// depois os fundos de imagem (assets estáticos em /public/backgrounds).
export const BACKGROUND_TOKENS = [
  "default",
  "mist",
  "stone",
  "slate",
  "graphite",
  "coal",
  "mesh",
  "flux",
  "code",
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
// a cor da amostra é a MESMA cor da tela aplicada no CSS por token. Para os
// fundos de imagem, `image` aponta ao asset; `swatch` é a cor média (fallback
// da amostra enquanto a imagem carrega).
export const BACKGROUND_SWATCHES: ReadonlyArray<{
  token: BackgroundToken;
  label: string;
  swatch: string;
  image?: string;
}> = [
  { token: "default", label: "Claro", swatch: "#f4f6f4" },
  { token: "mist", label: "Névoa", swatch: "#e7ebe7" },
  { token: "stone", label: "Pedra", swatch: "#d2d8d2" },
  { token: "slate", label: "Ardósia", swatch: "#b3bbb4" },
  { token: "graphite", label: "Grafite", swatch: "#484d47" },
  { token: "coal", label: "Carvão", swatch: "#141614" },
  { token: "mesh", label: "Rede", swatch: "#dbecf8", image: "/backgrounds/mesh.webp" },
  { token: "flux", label: "Fluxo", swatch: "#b0c0d7", image: "/backgrounds/flux.webp" },
  { token: "code", label: "Código", swatch: "#233e39", image: "/backgrounds/code.webp" },
];

// Linha de créditos exigida pela licença GRÁTIS da Freepik para as imagens de
// fundo, mostrada no seletor. TODO(vitor): "flux" e "code" vieram sem ficheiro
// de licença — confirma o autor exato de cada na tua página de download da
// Freepik e completa esta linha (o "mesh" é comprovadamente de starline).
export const BACKGROUND_IMAGE_CREDIT: { text: string; href: string } = {
  text: "Imagens de fundo por starline / Freepik e Freepik",
  href: "https://www.freepik.com",
};

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
