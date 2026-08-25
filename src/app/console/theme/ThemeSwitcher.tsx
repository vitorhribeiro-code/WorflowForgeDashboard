"use client";

import { useState } from "react";
import {
  CONSOLE_THEME_OPTIONS,
  type ConsoleTheme,
} from "@/modules/preferences/domain/preferences";

// Seletor de tema da consola. Aplicação OTIMISTA: mexe já no `data-theme` do
// `.console` (efeito imediato, sem esperar a rede) e faz o PUT à preferência em
// segundo plano. Se o PUT falhar, reverte para o tema anterior.
//
// Auto-estilado com os próprios tokens da consola (var(--panel)/--border/…) via
// styles inline — de propósito, para não acrescentar regras ao globals.css
// (ficheiro quente). As bolinhas usam o acento literal de cada tema.
export function ThemeSwitcher({ initial }: { initial: ConsoleTheme }) {
  const [theme, setTheme] = useState<ConsoleTheme>(initial);
  const [busy, setBusy] = useState(false);

  async function pick(next: ConsoleTheme) {
    if (next === theme || busy) return;
    const previous = theme;
    // Otimista: aplica no DOM e no estado antes da rede.
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
      // Reverte a escolha se a preferência não gravou.
      setTheme(previous);
      document.querySelector(".console")?.setAttribute("data-theme", previous);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label="Tema da consola"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: 4,
        borderRadius: 999,
        border: "1px solid var(--border)",
        background: "var(--panel)",
      }}
    >
      {CONSOLE_THEME_OPTIONS.map((opt) => {
        const selected = opt.token === theme;
        return (
          <button
            key={opt.token}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={opt.label}
            title={`${opt.label} — ${opt.blurb}`}
            onClick={() => pick(opt.token)}
            disabled={busy}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              cursor: busy ? "default" : "pointer",
              font: "inherit",
              fontSize: 12.5,
              fontWeight: 550,
              color: selected ? "var(--text)" : "var(--muted)",
              background: selected ? "var(--bg)" : "transparent",
              border: selected ? "1px solid var(--border)" : "1px solid transparent",
              borderRadius: 999,
              padding: "5px 11px 5px 8px",
              transition: "color .15s, background .15s",
            }}
          >
            <span
              aria-hidden
              style={{
                width: 11,
                height: 11,
                borderRadius: "50%",
                background: opt.swatch,
                boxShadow: selected ? `0 0 0 2px var(--panel), 0 0 0 3px ${opt.swatch}` : "none",
                flex: "0 0 auto",
              }}
            />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
