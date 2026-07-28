"use client";

import { useRef, useState } from "react";

type Props = {
  hour: number;
  minute: number;
  onChange: (hour: number, minute: number) => void;
  minuteStep?: number; // passo dos minutos nas setas (default 5)
  disabled?: boolean;
  ariaLabel?: string;
};

const pad = (n: number) => String(n).padStart(2, "0");
const wrap = (v: number, mod: number) => ((v % mod) + mod) % mod;

// Caixa de tempo segmentada (HH:MM) ao estilo flip-clock. Reutilizável fora do
// contexto de agenda (TTLs, atrasos, contagens). Tudo por props — sem estado de
// domínio cá dentro além do buffer de digitação. Ajusta por setas (rato),
// ArrowUp/Down (teclado) e digitação direta de dígitos.
export function TimeBoxes({
  hour,
  minute,
  onChange,
  minuteStep = 5,
  disabled = false,
  ariaLabel = "hora",
}: Props) {
  // Buffer de digitação por unidade: acumula até 2 dígitos e depois reinicia.
  const buf = useRef<{ unit: "h" | "m" | null; text: string }>({ unit: null, text: "" });
  const [, force] = useState(0);

  function commitHour(h: number) {
    onChange(wrap(h, 24), minute);
  }
  function commitMinute(m: number) {
    onChange(hour, wrap(m, 60));
  }

  function typeDigit(unit: "h" | "m", d: string) {
    if (buf.current.unit !== unit) buf.current = { unit, text: "" };
    const next = (buf.current.text + d).slice(-2);
    buf.current.text = next;
    const max = unit === "h" ? 23 : 59;
    const val = Math.min(max, Number(next));
    if (unit === "h") commitHour(val);
    else commitMinute(val);
    force((n) => n + 1);
  }

  function onKey(unit: "h" | "m", e: React.KeyboardEvent) {
    if (disabled) return;
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const dir = e.key === "ArrowUp" ? 1 : -1;
      if (unit === "h") commitHour(hour + dir);
      else commitMinute(minute + dir * minuteStep);
      buf.current = { unit: null, text: "" };
    } else if (/^\d$/.test(e.key)) {
      e.preventDefault();
      typeDigit(unit, e.key);
    }
  }

  const h = pad(hour);
  const m = pad(minute);

  return (
    <div className="sched-time" role="group" aria-label={ariaLabel}>
      <div
        className="sched-time-unit"
        tabIndex={disabled ? -1 : 0}
        role="spinbutton"
        aria-label="horas"
        aria-valuenow={hour}
        aria-valuemin={0}
        aria-valuemax={23}
        onKeyDown={(e) => onKey("h", e)}
      >
        <span className="sched-tile">{h[0]}</span>
        <span className="sched-tile">{h[1]}</span>
      </div>

      <span className="sched-time-colon">:</span>

      <div
        className="sched-time-unit"
        tabIndex={disabled ? -1 : 0}
        role="spinbutton"
        aria-label="minutos"
        aria-valuenow={minute}
        aria-valuemin={0}
        aria-valuemax={59}
        onKeyDown={(e) => onKey("m", e)}
      >
        <span className="sched-tile">{m[0]}</span>
        <span className="sched-tile">{m[1]}</span>
      </div>

      <div className="sched-time-steppers">
        <div className="sched-step-row">
          <button
            type="button"
            className="sched-step"
            aria-label="mais uma hora"
            disabled={disabled}
            onClick={() => commitHour(hour + 1)}
          >
            <span aria-hidden="true">&#8963;</span>
          </button>
          <button
            type="button"
            className="sched-step"
            aria-label={`mais ${minuteStep} minutos`}
            disabled={disabled}
            onClick={() => commitMinute(minute + minuteStep)}
          >
            <span aria-hidden="true">&#8963;</span>
          </button>
        </div>
        <div className="sched-step-row">
          <button
            type="button"
            className="sched-step"
            aria-label="menos uma hora"
            disabled={disabled}
            onClick={() => commitHour(hour - 1)}
          >
            <span aria-hidden="true">&#8964;</span>
          </button>
          <button
            type="button"
            className="sched-step"
            aria-label={`menos ${minuteStep} minutos`}
            disabled={disabled}
            onClick={() => commitMinute(minute - minuteStep)}
          >
            <span aria-hidden="true">&#8964;</span>
          </button>
        </div>
      </div>
    </div>
  );
}
