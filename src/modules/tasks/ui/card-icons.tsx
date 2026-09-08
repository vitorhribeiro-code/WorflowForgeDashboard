// -------------------------------------------------------------------------- //
//  Resolvedor de ícones do cartão (v42) — IconName → SVG inline.              //
//                                                                             //
//  Registo FECHADO, espelha 1:1 o `ICON_NAMES` do domínio (`card.ts`).        //
//  SVGs desenhados à mão no estilo Lucide (MIT): 24×24, stroke=currentColor,  //
//  sem libs nem fetch. Alargar o registo é decisão DELIBERADA (editar         //
//  `card.ts` E este ficheiro) — NUNCA algo que o LLM possa fazer (v43).       //
//                                                                             //
//  A cor vem do contexto (`currentColor`), por isso o mesmo ícone serve a     //
//  ilha escura (trabalhador) e o preview do catálogo sem alterações.          //
// -------------------------------------------------------------------------- //

import type { ReactNode } from "react";
import type { IconName } from "../domain/card";

const S = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

// Cada entrada devolve os PATHS internos; o wrapper <svg> é aplicado abaixo.
const PATHS: Record<IconName, ReactNode> = {
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M4 7l8 6 8-6" />
    </>
  ),
  pen: (
    <>
      <path d="M4 20l4-1L18 9l-3-3L5 16l-1 4z" />
      <path d="M14 7l3 3" />
    </>
  ),
  "bar-chart": (
    <>
      <path d="M5 19h14" />
      <path d="M7 19v-6M12 19V6m5 13v-9" />
    </>
  ),
  "cloud-download": (
    <>
      <path d="M7 16a4 4 0 010-8 5 5 0 019.6-1.3A3.5 3.5 0 0117 16" />
      <path d="M12 12v6m0 0l-2.5-2.5M12 18l2.5-2.5" />
    </>
  ),
  "file-text": (
    <>
      <path d="M6 3h8l4 4v14a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1z" />
      <path d="M14 3v4h4M8 12h8M8 16h6" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="16" rx="2.5" />
      <path d="M4 9h16M8 3v4M16 3v4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  repeat: (
    <>
      <path d="M17 3l3 3-3 3" />
      <path d="M20 6H8a4 4 0 00-4 4v1" />
      <path d="M7 21l-3-3 3-3" />
      <path d="M4 18h12a4 4 0 004-4v-1" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 6.5" />,
  "alert-triangle": (
    <>
      <path d="M12 4.5l8.5 15H3.5L12 4.5z" />
      <path d="M12 10v4M12 17.2v.1" />
    </>
  ),
  x: <path d="M6 6l12 12M18 6L6 18" />,
  bell: (
    <>
      <path d="M6 16V11a6 6 0 1112 0v5l2 2H4l2-2z" />
      <path d="M10 20a2 2 0 004 0" />
    </>
  ),
  zap: <path d="M13 3L5 13h6l-1 8 8-10h-6l1-8z" />,
  plug: (
    <>
      <path d="M9 3v5M15 3v5" />
      <path d="M7 8h10v3a5 5 0 01-10 0V8z" />
      <path d="M12 16v5" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a3.5 3.5 0 005 0l3-3a3.5 3.5 0 00-5-5l-1 1" />
      <path d="M14 10a3.5 3.5 0 00-5 0l-3 3a3.5 3.5 0 005 5l1-1" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12l8-8M17 4l2 2M15 6l2 2" />
    </>
  ),
  folder: <path d="M4 7a2 2 0 012-2h3l2 2h7a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V7z" />,
  tag: (
    <>
      <path d="M4 12V5a1 1 0 011-1h7l8 8-8 8-8-8z" />
      <circle cx="8.5" cy="8.5" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5" />
      <circle cx="12" cy="7.8" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  sparkles: (
    <>
      <path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6L12 4z" />
      <path d="M18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8L18 15z" />
    </>
  ),
};

// Resolve um nome do registo para o seu SVG. Devolve `null` para nomes fora do
// registo (o chamador decide o fallback — na prática o `validateCard` já barra
// ícones inválidos, por isso isto é só defesa em profundidade).
export function cardIcon(name: string): ReactNode {
  const paths = (PATHS as Record<string, ReactNode>)[name];
  if (!paths) return null;
  return (
    <svg {...S} width="100%" height="100%">
      {paths}
    </svg>
  );
}

export const CARD_ICON_NAMES = Object.keys(PATHS) as IconName[];
