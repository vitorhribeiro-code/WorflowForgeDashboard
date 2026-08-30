"use client";

import { useState, type CSSProperties } from "react";
import {
  CONSOLE_THEME_OPTIONS,
  type ConsoleTheme,
} from "@/modules/preferences/domain/preferences";

// Seletor de tema da consola, agora como BOLINHAS (redesign). Mesma lógica de
// sempre — aplicação OTIMISTA: mexe já no `data-theme` do `.console` (efeito
// imediato) e faz o PUT à preferência em segundo plano; se falhar, reverte.
// O estilo vive no globals.css (`.cx-dots`/`.cx-dot`); a cor de cada bolinha
// entra por `--_sw` (o acento literal de cada tema).
export function ThemeSwitcher({ initial }: { initial: ConsoleTheme }) {
  const [theme, setTheme] = useState<ConsoleTheme>(initial);
  const [busy, setBusy] = useState(false);

  async function pick(next: ConsoleTheme) {
    if (next === theme || busy) return;
    const previous = theme;
    setTheme(next);
    document.querySelector(".console")?.setAttribute("data-theme", next);
    setBusy(true);
    try {
      const res = await fetch("/api/me/preferences", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ consoleTheme: next }),
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      setTheme(previous);
      document.querySelector(".console")?.setAttribute("data-theme", previous);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cx-dots" role="radiogroup" aria-label="Tema da consola">
      {CONSOLE_THEME_OPTIONS.map((opt) => (
        <button
          key={opt.token}
          type="button"
          className="cx-dot"
          role="radio"
          aria-checked={opt.token === theme}
          aria-label={opt.label}
          title={`${opt.label} — ${opt.blurb}`}
          onClick={() => pick(opt.token)}
          disabled={busy}
          style={{ "--_sw": opt.swatch } as CSSProperties}
        />
      ))}
    </div>
  );
}
