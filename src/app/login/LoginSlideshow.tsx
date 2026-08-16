"use client";

import { useEffect, useState } from "react";

// Slides do deck (Gamma) exportados para WebP em public/login-slides/.
const SLIDE_COUNT = 10;
const SLIDES = Array.from(
  { length: SLIDE_COUNT },
  (_, i) => `/login-slides/slide-${String(i + 1).padStart(2, "0")}.webp`,
);
const INTERVAL_MS = 9000;

// Cada slide é 16:9; o painel é vertical. Mostramos o slide nítido (contain)
// sobre um fundo desfocado do próprio slide (cover), para preencher o painel
// sem barras. Crossfade por opacidade; loop automático. Puramente decorativo.
export function LoginSlideshow() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const t = setInterval(
      () => setActive((v) => (v + 1) % SLIDE_COUNT),
      INTERVAL_MS,
    );
    return () => clearInterval(t);
  }, []);

  return (
    <div className="wf-slides" aria-hidden="true">
      {SLIDES.map((src, idx) => (
        <div className={`wf-slide${idx === active ? " is-active" : ""}`} key={src}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="wf-slide__bg" src={src} alt="" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="wf-slide__fg" src={src} alt="" />
        </div>
      ))}
    </div>
  );
}
