/* -------------------------------------------------------------------------- */
/*  Redução + análise de imagem no cliente (fundo personalizado)              */
/*                                                                            */
/*  Recebe um File (upload local), reduz para um WebP pequeno (data URL) E    */
/*  amostra a imagem para derivar tokens de cor (acento por modo + tinta do   */
/*  cabeçalho). Corre só no browser (canvas/WebP); o servidor só valida e     */
/*  guarda. A MATEMÁTICA de cor é pura e exportada — testada sem canvas.      */
/* -------------------------------------------------------------------------- */

import {
  MAX_CUSTOM_BACKGROUND_BYTES,
  type CustomTokens,
} from "@/modules/preferences/domain/preferences";

const MAX_DIM = 1600; // teto do lado maior (chega para uma tela de fundo)
const TARGET_BYTES = 200 * 1024; // alvo do sweep (folga até ao teto do domínio)
const QUALITIES = [0.82, 0.72, 0.62, 0.5, 0.4] as const;
const DIM_STEPS = 3; // nº de recuos de dimensão se a qualidade não chegar
const SAMPLE_DIM = 48; // lado da grelha de amostragem para a análise de cor

type Decoded = ImageBitmap | HTMLImageElement;

export async function reduceCustomBackground(
  file: File,
): Promise<{ dataUrl: string; tokens: CustomTokens }> {
  if (!file.type.startsWith("image/")) {
    throw new Error("O ficheiro não é uma imagem.");
  }
  const img = await decode(file);
  const srcW = "naturalWidth" in img ? img.naturalWidth : img.width;
  const srcH = "naturalWidth" in img ? img.naturalHeight : img.height;
  if (!srcW || !srcH) throw new Error("Não foi possível ler as dimensões da imagem.");

  const dataUrl = await reduce(img, srcW, srcH);
  const tokens = analyze(img, srcW, srcH);
  return { dataUrl, tokens };
}

/* ----------------------------- redução (bytes) ---------------------------- */

async function reduce(img: Decoded, srcW: number, srcH: number): Promise<string> {
  const scale = Math.min(1, MAX_DIM / Math.max(srcW, srcH));
  let w = Math.max(1, Math.round(srcW * scale));
  let h = Math.max(1, Math.round(srcH * scale));

  let best: Blob | null = null;
  for (let step = 0; step < DIM_STEPS; step++) {
    for (const q of QUALITIES) {
      const blob = await encode(img, w, h, q);
      if (!blob) continue;
      if (!best || blob.size < best.size) best = blob;
      if (blob.size <= TARGET_BYTES) break;
    }
    if (best && best.size <= TARGET_BYTES) break;
    w = Math.max(1, Math.round(w * 0.8));
    h = Math.max(1, Math.round(h * 0.8));
  }

  if (!best) throw new Error("Falha ao processar a imagem.");
  if (best.size > MAX_CUSTOM_BACKGROUND_BYTES) {
    throw new Error("Imagem demasiado grande mesmo depois de reduzir.");
  }
  return blobToDataUrl(best);
}

/* --------------------------- análise (cores) ------------------------------ */

// Desenha a imagem numa grelha pequena, lê os pixels e deriva os tokens.
// Se algo falhar (canvas indisponível), devolve tokens neutros (sem acento,
// cabeçalho escuro) — o CSS cai no comportamento da marca.
function analyze(img: Decoded, srcW: number, srcH: number): CustomTokens {
  try {
    const ar = srcW / srcH;
    const w = ar >= 1 ? SAMPLE_DIM : Math.max(1, Math.round(SAMPLE_DIM * ar));
    const h = ar >= 1 ? Math.max(1, Math.round(SAMPLE_DIM / ar)) : SAMPLE_DIM;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return NEUTRAL_TOKENS;
    ctx.drawImage(img, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    return deriveTokens(analyzePixels(data, w, h));
  } catch {
    return NEUTRAL_TOKENS;
  }
}

const NEUTRAL_TOKENS: CustomTokens = { accentLight: null, accentDark: null, litehdr: false };

/* ----------------------- matemática pura (testável) ----------------------- */

const NEAR_GREY_SAT = 0.1; // abaixo disto: imagem quase-cinzenta → sem acento
const SAT_MIN = 0.45;
const SAT_MAX = 0.72;
// Luminância relativa da superfície escura (--wf-surface #1a221d) e do wash claro.
const DARK_SURFACE_LUM = relLuminance(26, 34, 29);
const LIGHT_WASH_LUM = 0.9; // rgb(244,246,244)
const LIGHT_WASH_ALPHA = 0.42;

export type ImageStats = { hue: number; sat: number; topLum: number };

// Estatísticas de um buffer RGBA: matiz dominante (média circular ponderada pela
// saturação), saturação média e luminância média do topo (região do cabeçalho).
export function analyzePixels(data: Uint8ClampedArray, w: number, h: number): ImageStats {
  let sumSin = 0;
  let sumCos = 0;
  let satSum = 0;
  let satCount = 0;
  let topLumSum = 0;
  let topCount = 0;
  const topRows = Math.max(1, Math.round(h * 0.34));

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      const [hue, sat, lum] = rgbToHsl(r, g, b);
      // Matiz: ignora pixels quase-pretos/brancos (matiz instável), pondera por sat.
      if (lum > 0.06 && lum < 0.96) {
        const rad = (hue * Math.PI) / 180;
        sumSin += sat * Math.sin(rad);
        sumCos += sat * Math.cos(rad);
        satSum += sat;
        satCount++;
      }
      if (y < topRows) {
        topLumSum += relLuminance(r, g, b);
        topCount++;
      }
    }
  }

  let hue = 0;
  if (sumSin !== 0 || sumCos !== 0) {
    hue = (Math.atan2(sumSin, sumCos) * 180) / Math.PI;
    if (hue < 0) hue += 360;
  }
  const sat = satCount > 0 ? satSum / satCount : 0;
  const topLum = topCount > 0 ? topLumSum / topCount : 0.5;
  return { hue, sat, topLum };
}

// Deriva o acento (claro/escuro) da matiz + saturação, com guardas de contraste.
// null/null quando a imagem é quase-cinzenta (mantém a marca).
export function deriveAccent(
  hue: number,
  sat: number,
): { light: string | null; dark: string | null } {
  if (sat < NEAR_GREY_SAT) return { light: null, dark: null };
  const s = clamp(sat, SAT_MIN, SAT_MAX);

  // Claro: acento sobre cartão/tela clara, com texto branco por cima (botões).
  // Escurece até contrastar >= 3.0 com o branco.
  let ll = 0.44;
  while (ll > 0.3 && contrastWith(hslToRgb(hue, s, ll), WHITE_LUM) < 3.0) ll -= 0.02;

  // Escuro: acento sobre tint escura, usado como cor viva (texto/pill). Clareia
  // até contrastar >= 3.5 com a superfície escura.
  let ld = 0.56;
  while (ld < 0.74 && contrastWith(hslToRgb(hue, s, ld), DARK_SURFACE_LUM) < 3.5) ld += 0.02;

  return {
    light: toHex(hslToRgb(hue, s, ll)),
    dark: toHex(hslToRgb(hue, s, ld)),
  };
}

// Cabeçalho: no modo claro o wash é claro; compõe a luminância do topo com o
// wash e, se ficar escuro, pede tinta clara (litehdr). No escuro já é clara.
export function decideLitehdr(topLum: number): boolean {
  const composite = topLum * (1 - LIGHT_WASH_ALPHA) + LIGHT_WASH_LUM * LIGHT_WASH_ALPHA;
  return composite < 0.52;
}

export function deriveTokens(stats: ImageStats): CustomTokens {
  const a = deriveAccent(stats.hue, stats.sat);
  return { accentLight: a.light, accentDark: a.dark, litehdr: decideLitehdr(stats.topLum) };
}

/* ------------------------------ cor: helpers ------------------------------ */

const WHITE_LUM = 1;

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return [h, s, l];
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

export function relLuminance(r: number, g: number, b: number): number {
  const f = (c: number) => {
    const cs = c / 255;
    return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrastWith(rgb: [number, number, number], otherLum: number): number {
  const l = relLuminance(rgb[0], rgb[1], rgb[2]);
  const hi = Math.max(l, otherLum);
  const lo = Math.min(l, otherLum);
  return (hi + 0.05) / (lo + 0.05);
}

export function toHex(rgb: [number, number, number]): string {
  return "#" + rgb.map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0")).join("");
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/* --------------------------- browser: decode/encode ----------------------- */

async function decode(file: File): Promise<Decoded> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // cai no caminho do <img> (ex.: formato que o createImageBitmap recusa)
    }
  }
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível abrir a imagem."));
    };
    img.src = url;
  });
}

function encode(src: Decoded, w: number, h: number, quality: number): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.drawImage(src, 0, 0, w, h);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/webp", quality));
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Falha ao ler a imagem reduzida."));
    reader.readAsDataURL(blob);
  });
}
