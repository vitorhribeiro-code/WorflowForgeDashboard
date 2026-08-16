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
  // Fundo personalizado: imagem carregada pelo trabalhador. Ao contrário dos
  // restantes, não tem cor/asset fixo — os bytes (WebP reduzido) vivem em
  // users.preferences.customBackground e a imagem entra por --wf-custom-image.
  "custom",
] as const;

export type BackgroundToken = (typeof BACKGROUND_TOKENS)[number];

export const DEFAULT_BACKGROUND: BackgroundToken = "default";

// Modo do painel: claro (o atual) ou escuro (inverte a luminância — tela e
// cartões escuros, texto claro). Ortogonal ao fundo: combina com qualquer um.
export const MODE_TOKENS = ["light", "dark"] as const;
export type ModeToken = (typeof MODE_TOKENS)[number];
export const DEFAULT_MODE: ModeToken = "light";

// Opções apresentáveis do modo (rótulo PT). Fonte única para a UI.
export const MODE_OPTIONS: ReadonlyArray<{ token: ModeToken; label: string }> = [
  { token: "light", label: "Claro" },
  { token: "dark", label: "Escuro" },
];

// Preferências de um utilizador. Guardadas em users.preferences (jsonb).
// customBackground: data URL de um WebP reduzido (≤ ~200 KB) OU null. Vive no
// mesmo jsonb livre (sem migração, como background/mode). Servido de volta ao
// cliente e injetado como var CSS; a leitura admin NÃO recebe os bytes.
// Tokens DERIVADOS da imagem personalizada (fase das cores automáticas). São
// computados no cliente ao carregar e guardados no jsonb a par dos bytes:
//  - accentLight/accentDark: acento (rampa da marca) derivado da matiz dominante,
//    já com guardas de contraste para o cartão branco (claro) E escuro (escuro).
//    null = imagem quase-cinzenta → mantém o acento da marca.
//  - litehdr: true quando a imagem (com o wash claro) fica escura no topo, pelo
//    que o cabeçalho precisa de tinta CLARA já no modo claro (no escuro já é).
// Os valores são hex canónico (#rrggbb) porque entram numa style inline.
export type CustomTokens = {
  accentLight: string | null;
  accentDark: string | null;
  litehdr: boolean;
};

export type UserPreferences = {
  background: BackgroundToken;
  mode: ModeToken;
  customBackground: string | null;
  customTokens: CustomTokens | null;
};

export const DEFAULT_PREFERENCES: UserPreferences = {
  background: DEFAULT_BACKGROUND,
  mode: DEFAULT_MODE,
  customBackground: null,
  customTokens: null,
};

// Teto do WebP reduzido guardado no jsonb. O cliente mira ≤200 KB; deixamos
// folga até 256 KB para o sweep de qualidade não falhar por pouco.
export const MAX_CUSTOM_BACKGROUND_BYTES = 256 * 1024;
const CUSTOM_BACKGROUND_PREFIX = "data:image/webp;base64,";

// Nº de bytes de um base64 canónico (múltiplo de 4, com padding). -1 se malformado.
function base64ByteLength(b64: string): number {
  const len = b64.length;
  if (len === 0 || len % 4 !== 0) return -1;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return -1;
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return (len / 4) * 3 - pad;
}

// Aceita apenas um data URL de WebP dentro do teto. Não descodifica a imagem —
// valida o formato do envelope e o tamanho (a redução real é no cliente).
export function isValidCustomBackground(v: unknown): v is string {
  if (typeof v !== "string") return false;
  if (!v.startsWith(CUSTOM_BACKGROUND_PREFIX)) return false;
  const bytes = base64ByteLength(v.slice(CUSTOM_BACKGROUND_PREFIX.length));
  return bytes > 0 && bytes <= MAX_CUSTOM_BACKGROUND_BYTES;
}

// Hex canónico #rrggbb (minúsculas ou maiúsculas). Estrito de propósito: estes
// valores entram numa style inline, por isso nada de funções/espaços/;.
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
export function isHexColor(v: unknown): v is string {
  return typeof v === "string" && HEX_COLOR_RE.test(v);
}

// Normaliza os tokens derivados. Aceita accent* como hex OU null (quase-cinzenta),
// e litehdr como booleano. Qualquer outra coisa → descarta o token para null (o
// CSS cai no acento/tinta da marca). Nunca lança.
export function normalizeCustomTokens(raw: unknown): CustomTokens | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const accentLight = isHexColor(o.accentLight) ? o.accentLight.toLowerCase() : null;
  const accentDark = isHexColor(o.accentDark) ? o.accentDark.toLowerCase() : null;
  const litehdr = o.litehdr === true;
  // Se não sobrou nada de útil (sem acento e sem litehdr), não vale guardar.
  if (!accentLight && !accentDark && !litehdr) return null;
  return { accentLight, accentDark, litehdr };
}

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
  { token: "default", label: "Neutro", swatch: "#f4f6f4" },
  { token: "mist", label: "Névoa", swatch: "#e7ebe7" },
  { token: "stone", label: "Pedra", swatch: "#d2d8d2" },
  { token: "slate", label: "Ardósia", swatch: "#b3bbb4" },
  { token: "graphite", label: "Grafite", swatch: "#484d47" },
  { token: "coal", label: "Carvão", swatch: "#141614" },
  { token: "mesh", label: "Rede", swatch: "#dbecf8", image: "/backgrounds/mesh.webp" },
  { token: "flux", label: "Fluxo", swatch: "#b0c0d7", image: "/backgrounds/flux.webp" },
  { token: "code", label: "Código", swatch: "#233e39", image: "/backgrounds/code.webp" },
  // Entrada do fundo personalizado: fonte única do rótulo (a consola admin usa
  // este `label`). Na fila de amostras das Definições é filtrada — o custom tem
  // o seu bloco de upload próprio. `swatch` é só o fallback neutro da amostra.
  { token: "custom", label: "Personalizado", swatch: "#c9d2cb" },
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

export function isModeToken(v: unknown): v is ModeToken {
  return typeof v === "string" && (MODE_TOKENS as readonly string[]).includes(v);
}

// Normaliza o jsonb livre (pode vir null, {}, ou com lixo) para preferências
// válidas, sempre com defaults seguros. Nunca lança.
export function normalizePreferences(raw: unknown): UserPreferences {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const bg = "background" in obj ? obj.background : undefined;
  const mode = "mode" in obj ? obj.mode : undefined;
  const cbg = "customBackground" in obj ? obj.customBackground : undefined;
  const ctk = "customTokens" in obj ? obj.customTokens : undefined;

  const customBackground = isValidCustomBackground(cbg) ? cbg : null;
  const bgToken = isBackgroundToken(bg) ? bg : DEFAULT_BACKGROUND;
  // Coerência: só se pode estar em "custom" se houver imagem válida. Caso
  // contrário (jsonb antigo/lixo, ou imagem removida) volta ao default.
  const background = bgToken === "custom" && !customBackground ? DEFAULT_BACKGROUND : bgToken;
  // Os tokens derivados só fazem sentido com uma imagem; sem ela, descarta.
  const customTokens = customBackground ? normalizeCustomTokens(ctk) : null;

  return {
    background,
    mode: isModeToken(mode) ? mode : DEFAULT_MODE,
    customBackground,
    customTokens,
  };
}
