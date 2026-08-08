/* -------------------------------------------------------------------------- */
/*  Estilos de escrita — domínio (puro, isomórfico servidor/cliente)          */
/*                                                                            */
/*  O .md é texto de confiança: guarda-se tal e qual, sem parsing. As únicas  */
/*  regras são defensivas (tipo, tamanho, não-vazio).                         */
/* -------------------------------------------------------------------------- */

// ~32 KB: um perfil de estilo realista e completo mede ~3,5 KB; mesmo um
// exaustivo raramente passa de 6–8 KB. 32 KB é folga larga. É só uma constante.
export const MAX_STYLE_BYTES = 32 * 1024;

export const ALLOWED_STYLE_EXTENSIONS = [".md", ".markdown"] as const;

export type WritingStyleView = {
  workerId: string;
  sourceFilename: string | null;
  bytes: number;
  updatedAt: string; // ISO
  contentMd: string;
};

// TextEncoder existe em Node 18+ e no browser → o domínio serve os dois lados.
export function styleByteLength(contentMd: string): number {
  return new TextEncoder().encode(contentMd).length;
}

export function hasAllowedExtension(filename: string): boolean {
  const lower = filename.toLowerCase();
  return ALLOWED_STYLE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

// Puro: devolve uma mensagem de erro (PT) ou null se o upload é válido.
export function validateStyleUpload(filename: string, contentMd: string): string | null {
  if (!filename || !hasAllowedExtension(filename)) {
    return "O ficheiro tem de ser .md (Markdown).";
  }
  if (contentMd.trim().length === 0) {
    return "O ficheiro de estilo está vazio.";
  }
  if (styleByteLength(contentMd) > MAX_STYLE_BYTES) {
    return `O ficheiro excede o limite de ${Math.round(MAX_STYLE_BYTES / 1024)} KB.`;
  }
  return null;
}
