/* -------------------------------------------------------------------------- */
/*  Redução de imagem no cliente (Fase 1 do fundo personalizado)              */
/*                                                                            */
/*  Recebe um File (upload local), reduz para um WebP pequeno e devolve um    */
/*  data URL pronto a guardar em users.preferences.customBackground. Corre    */
/*  só no browser (canvas/WebP) — mantém o servidor simples (só valida e      */
/*  guarda a string) e dispensa dependências pesadas no bundle da Vercel.     */
/*                                                                            */
/*  Estratégia: teto do lado maior (MAX_DIM) e depois sweep de qualidade;     */
/*  se ainda passar o alvo, recua a dimensão e repete. Garante o teto rígido  */
/*  do domínio (MAX_CUSTOM_BACKGROUND_BYTES) antes de devolver.               */
/* -------------------------------------------------------------------------- */

import { MAX_CUSTOM_BACKGROUND_BYTES } from "@/modules/preferences/domain/preferences";

const MAX_DIM = 1600; // teto do lado maior (chega para uma tela de fundo)
const TARGET_BYTES = 200 * 1024; // alvo do sweep (folga até ao teto do domínio)
const QUALITIES = [0.82, 0.72, 0.62, 0.5, 0.4] as const;
const DIM_STEPS = 3; // nº de recuos de dimensão se a qualidade não chegar

type Decoded = ImageBitmap | HTMLImageElement;

export async function fileToReducedWebp(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("O ficheiro não é uma imagem.");
  }
  const img = await decode(file);
  const srcW = "naturalWidth" in img ? img.naturalWidth : img.width;
  const srcH = "naturalWidth" in img ? img.naturalHeight : img.height;
  if (!srcW || !srcH) throw new Error("Não foi possível ler as dimensões da imagem.");

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
