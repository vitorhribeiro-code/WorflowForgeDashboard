"use client";

import { useState } from "react";
import { isValidCron } from "../domain/cron";
import { buildCron, parseCron, type Recurrence } from "../domain/recurrence";
import { TimeBoxes } from "./TimeBoxes";

type Props = {
  initial: string | null; // cron atual ou null (sem agenda)
  busy?: boolean;
  onSave: (cron: string) => void;
  onCancel: () => void;
};

const FREQS: Array<{ f: Recurrence["freq"]; label: string }> = [
  { f: "minutes", label: "A cada X min" },
  { f: "daily", label: "Diária" },
  { f: "weekly", label: "Semanal" },
  { f: "monthly", label: "Mensal" },
  { f: "advanced", label: "Avançado" },
];

// Ordem amigável (segunda primeiro) → número cron (0=domingo).
const DOW: Array<[string, number]> = [
  ["Seg", 1],
  ["Ter", 2],
  ["Qua", 3],
  ["Qui", 4],
  ["Sex", 5],
  ["Sáb", 6],
  ["Dom", 0],
];
const DOW_NAME: Record<number, string> = {
  0: "domingo",
  1: "segunda",
  2: "terça",
  3: "quarta",
  4: "quinta",
  5: "sexta",
  6: "sábado",
};

const pad = (n: number) => String(n).padStart(2, "0");

function describe(r: Recurrence): string {
  if (r.freq === "minutes") {
    return `A cada ${r.interval} ${r.interval === 1 ? "minuto" : "minutos"}`;
  }
  if (r.freq === "advanced") return "Expressão personalizada";
  const t = `${pad(r.hour)}:${pad(r.minute)}`;
  if (r.freq === "daily") return `Todos os dias às ${t} UTC`;
  if (r.freq === "monthly") return `No dia ${r.dom} de cada mês às ${t} UTC`;
  // weekly
  const days = [...r.days].sort((a, b) => a - b);
  if (!days.length) return "Escolhe pelo menos um dia";
  if (days.length === 7) return `Todos os dias às ${t} UTC`;
  if (days.join(",") === "1,2,3,4,5") return `Dias úteis às ${t} UTC`;
  return `${days.map((d) => DOW_NAME[d]).join(", ")} às ${t} UTC`;
}

export function RecurrenceBuilder({ initial, busy = false, onSave, onCancel }: Props) {
  // Estado inicial derivado do cron atual (parseCron abre no modo certo, ou em
  // Avançado se o padrão não couber). Sem agenda → default diária às 09:00 UTC.
  const init = parseCron(initial ?? "0 9 * * *");
  const [freq, setFreq] = useState<Recurrence["freq"]>(init.freq);
  const [interval, setIntervalState] = useState(init.freq === "minutes" ? init.interval : 5);
  const [hour, setHour] = useState("hour" in init ? init.hour : 9);
  const [minute, setMinute] = useState("minute" in init ? init.minute : 0);
  const [days, setDays] = useState<number[]>(init.freq === "weekly" ? init.days : [1, 2, 3, 4, 5]);
  const [dom, setDom] = useState(init.freq === "monthly" ? init.dom : 1);
  const [adv, setAdv] = useState(init.freq === "advanced" ? init.expr : (initial ?? ""));

  function currentRec(): Recurrence {
    if (freq === "minutes") return { freq, interval };
    if (freq === "daily") return { freq, hour, minute };
    if (freq === "weekly") return { freq, hour, minute, days };
    if (freq === "monthly") return { freq, hour, minute, dom };
    return { freq: "advanced", expr: adv };
  }

  const rec = currentRec();
  const cron = buildCron(rec);
  const invalid =
    (freq === "weekly" && days.length === 0) ||
    (freq === "advanced" && !isValidCron(adv.trim()));

  function toggleDay(d: number) {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }

  return (
    <div className="sched-builder">
      <div className="sched-freq" role="group" aria-label="frequência">
        {FREQS.map(({ f, label }) => (
          <button
            key={f}
            type="button"
            className={`sched-freq-btn${freq === f ? " is-on" : ""}`}
            disabled={busy}
            onClick={() => setFreq(f)}
          >
            {label}
          </button>
        ))}
      </div>

      {freq === "minutes" ? (
        <div className="sched-row">
          <span className="sched-lbl">Correr a cada</span>
          <input
            type="number"
            min={1}
            max={59}
            value={interval}
            disabled={busy}
            className="sched-num"
            onChange={(e) =>
              setIntervalState(Math.max(1, Math.min(59, Number(e.target.value) || 1)))
            }
          />
          <span className="sched-lbl">minutos</span>
        </div>
      ) : null}

      {freq === "daily" || freq === "weekly" || freq === "monthly" ? (
        <div className="sched-field">
          <span className="sched-lbl">
            Hora <span className="sched-utc">(UTC)</span>
          </span>
          <TimeBoxes
            hour={hour}
            minute={minute}
            disabled={busy}
            onChange={(h, m) => {
              setHour(h);
              setMinute(m);
            }}
          />
        </div>
      ) : null}

      {freq === "weekly" ? (
        <div className="sched-field">
          <span className="sched-lbl">Dias da semana</span>
          <div className="sched-days">
            {DOW.map(([label, d]) => (
              <button
                key={d}
                type="button"
                className={`sched-day${days.includes(d) ? " is-on" : ""}`}
                disabled={busy}
                onClick={() => toggleDay(d)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {freq === "monthly" ? (
        <div className="sched-row">
          <span className="sched-lbl">No dia</span>
          <input
            type="number"
            min={1}
            max={31}
            value={dom}
            disabled={busy}
            className="sched-num"
            onChange={(e) => setDom(Math.max(1, Math.min(31, Number(e.target.value) || 1)))}
          />
          <span className="sched-lbl">de cada mês</span>
        </div>
      ) : null}

      {freq === "advanced" ? (
        <div className="sched-field">
          <span className="sched-lbl">
            Expressão cron <span className="sched-utc">(5 campos, UTC)</span>
          </span>
          <input
            type="text"
            value={adv}
            disabled={busy}
            className="sched-raw"
            placeholder="min hora dia mês dds"
            onChange={(e) => setAdv(e.target.value)}
          />
          {adv.trim() && !isValidCron(adv.trim()) ? (
            <span className="sched-hint">cron inválido (5 campos)</span>
          ) : null}
        </div>
      ) : null}

      <div className="sched-preview">
        <div>
          <span className="sched-preview-lbl">Pré-visualização</span>
          <span className="sched-preview-text">{describe(rec)}</span>
        </div>
        <code className="sched-cron">{cron}</code>
      </div>

      <div className="sched-actions">
        <button
          type="button"
          className="btn-mini"
          disabled={busy || invalid}
          onClick={() => onSave(cron)}
        >
          Guardar
        </button>
        <button type="button" className="btn-mini ghost" disabled={busy} onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
