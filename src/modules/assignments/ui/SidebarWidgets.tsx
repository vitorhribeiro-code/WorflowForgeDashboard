"use client";

/**
 * Widgets do rail do Painel do Trabalhador (Fase C2 do redesign).
 *
 *  - NextRunWidget: a próxima execução agendada, derivada do cron das próprias
 *    atribuições (puro, no cliente — nada de rede). Avaliação em UTC, como todo
 *    o motor; o fuso da org fica para §5.3.
 *  - RecentRunsWidget: feed dos últimos Runs do trabalhador (GET /api/runs/mine),
 *    com "ver mais" a expandir de 2 para 6.
 *
 * Design system do projeto (globals.css, CSS-vars), tudo sob `.wf-app`.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { WorkerAssignmentView } from "@/modules/assignments";
import { nextRunAfter } from "../domain/cron";
import { describeCron } from "../domain/recurrence";
import { fetchMineRuns, type MineRunRow } from "./use-worker-tasks";

/* --- Semáforo (reaproveita .status-pill como no painel) ------------------- */

type Tone = "green" | "amber" | "red" | "grey";

function Pill({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span className={`status-pill status-${tone}`}>
      <span className="readiness-dot" aria-hidden />
      {label}
    </span>
  );
}

const RefreshIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path
      d="M20 11a8 8 0 10-.6 4M20 5v5h-5"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/* --- Próxima execução ----------------------------------------------------- */

type NextRun = { task: WorkerAssignmentView; at: Date; schedule: string };

// A execução agendada mais próxima entre as atribuições automáticas ativas com
// agenda. Não promete nada de assistidas (não têm schedule) nem de desativadas.
function soonestNextRun(tasks: WorkerAssignmentView[], from: Date): NextRun | null {
  let best: NextRun | null = null;
  for (const t of tasks) {
    if (!t.enabled || t.taskType !== "automation" || !t.schedule) continue;
    const at = nextRunAfter(t.schedule, from);
    if (!at) continue;
    if (!best || at.getTime() < best.at.getTime()) {
      best = { task: t, at, schedule: t.schedule };
    }
  }
  return best;
}

// Distância legível em PT, zona-agnóstica (só depende do delta).
function formatRelative(ms: number): string {
  if (ms <= 0) return "agora mesmo";
  const min = Math.round(ms / 60_000);
  if (min < 1) return "dentro de menos de 1 min";
  if (min < 60) return `daqui a ${min} min`;
  const h = Math.floor(min / 60);
  const remMin = min % 60;
  if (h < 24) return remMin ? `daqui a ${h} h ${remMin} min` : `daqui a ${h} h`;
  const d = Math.floor(h / 24);
  const remH = h % 24;
  return remH ? `daqui a ${d} d ${remH} h` : `daqui a ${d} d`;
}

// Instante absoluto rotulado em UTC — coerente com as agendas (describeCron diz
// "às 8h" em UTC). Evita a discrepância de zona até §5.3 estar feita.
function formatUtc(d: Date): string {
  const s = d.toLocaleString("pt-PT", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
  return `${s} UTC`;
}

export function NextRunWidget({ tasks }: { tasks: WorkerAssignmentView[] }) {
  // Tick de 30s para o "daqui a…" não ficar preso e a próxima rolar ao disparar.
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const next = useMemo(() => soonestNextRun(tasks, new Date(nowMs)), [tasks, nowMs]);

  return (
    <section className="wf-widget" aria-label="Próxima execução">
      <div className="wf-widget-head">
        <span className="wf-widget-title">Próxima execução</span>
      </div>
      {next ? (
        <div className="wf-next">
          <span className="wf-next-rel">{formatRelative(next.at.getTime() - nowMs)}</span>
          <span className="wf-next-task">{next.task.taskName}</span>
          <span className="wf-next-sub">
            {describeCron(next.schedule)} · {formatUtc(next.at)}
          </span>
          {!next.task.ready && (
            <span className="wf-next-warn">Requer conexões para correr</span>
          )}
        </div>
      ) : (
        <p className="wf-widget-empty">Sem execuções agendadas.</p>
      )}
    </section>
  );
}

/* --- Execuções recentes --------------------------------------------------- */

function runPill(run: MineRunRow): { tone: Tone; label: string } {
  if (run.status === "success") return { tone: "green", label: "Concluído" };
  if (run.status === "queued") return { tone: "amber", label: "Em fila" };
  if (run.status === "running") return { tone: "amber", label: "A correr" };
  if (run.outcome === "cancelled") return { tone: "grey", label: "Cancelado" };
  return { tone: "red", label: "Falhou" };
}

// Instante real de criação → zona local (é um instante, não wall-clock de cron).
function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const COLLAPSED = 2;
const EXPANDED = 6;

export function RecentRunsWidget() {
  const [runs, setRuns] = useState<MineRunRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setRuns(await fetchMineRuns(EXPANDED));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = runs ? runs.slice(0, expanded ? EXPANDED : COLLAPSED) : [];
  const hiddenCount = runs ? Math.min(runs.length, EXPANDED) - COLLAPSED : 0;

  return (
    <section className="wf-widget" aria-label="Execuções recentes">
      <div className="wf-widget-head">
        <span className="wf-widget-title">Execuções recentes</span>
        <button
          type="button"
          className="wf-widget-refresh"
          onClick={() => void load()}
          disabled={busy}
          aria-label="Atualizar"
          title="Atualizar"
        >
          {RefreshIcon}
        </button>
      </div>

      {error ? (
        <p className="wf-widget-empty">{error}</p>
      ) : runs === null ? (
        <div className="wf-feed" aria-busy>
          {[0, 1].map((i) => (
            <div key={i} className="wf-feed-skel" />
          ))}
        </div>
      ) : runs.length === 0 ? (
        <p className="wf-widget-empty">Ainda sem execuções.</p>
      ) : (
        <>
          <div className="wf-feed">
            {shown.map((run) => {
              const pill = runPill(run);
              return (
                <div key={run.id} className="wf-feed-item">
                  <span className="wf-feed-task">{run.taskName}</span>
                  <span className="wf-feed-meta">
                    <Pill tone={pill.tone} label={pill.label} />
                    <span className="wf-feed-when">{formatWhen(run.createdAt)}</span>
                  </span>
                </div>
              );
            })}
          </div>
          {hiddenCount > 0 && (
            <button
              type="button"
              className="wf-widget-more"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "Ver menos" : `Ver mais (${hiddenCount})`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
