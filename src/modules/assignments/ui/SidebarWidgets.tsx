"use client";

/**
 * Cartões compactos do TOPO do Painel do Trabalhador (redesign do topo).
 *
 *  - NextRunWidget: cartão "Próxima ação" (hero). Mostra a ação agendada mais
 *    próxima (uma linha: "daqui a…" + tarefa · cadência). Um "+" abre um popup
 *    ESTILO-CARTÃO com as PRÓXIMAS ações agendadas.
 *  - RecentRunsWidget: cartão "Ações recentes". Mostra a última ação (tarefa +
 *    estado + hora). Um "+" abre um popup com as últimas ações (3/5/10).
 *
 * Ambos são auto-suficientes (buscam os próprios dados) e vivem em `.wf-topcards`
 * no topo da vista de tarefas. Os popups são montados DENTRO do `.wf-app`, para
 * herdarem os tokens `--wf-*` (senão o cartão do popup fica sem fundo). Avaliação
 * de cron em UTC, como o motor; o fuso da org fica para §5.3.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { WorkerAssignmentView } from "@/modules/assignments";
import { nextRunAfter } from "../domain/cron";
import { describeCron } from "../domain/recurrence";
import { fetchMineAssignments, fetchMineRuns, type MineRunRow } from "./use-worker-tasks";

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

/* --- Ícones (SVG inline; os "ti ti-*" do Tabler não existem na app) -------- */

const IcClock = (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.7" />
    <path d="M12 8v4l2.5 1.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);
const IcHistory = (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M4 12a8 8 0 108-8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <path d="M4 4v4h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IcPlus = (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);
const RefreshIcon = (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden>
    <path
      d="M20 11a8 8 0 10-.6 4M20 5v5h-5"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/* --- Popup estilo-cartão (overlay + card; Esc e clique-fora fecham) -------- */

function CardPopup({
  label,
  icon,
  onClose,
  headExtra,
  children,
}: {
  label: string;
  icon: ReactNode;
  onClose: () => void;
  headExtra?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="wf-pop-overlay" role="presentation" onClick={onClose}>
      <div
        className="wf-pop"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="wf-pop-head">
          <span className="wf-tc-ic">{icon}</span>
          <span className="wf-tc-title">{label}</span>
          <div className="wf-pop-actions">
            {headExtra}
            <button
              type="button"
              className="wf-tc-btn wf-pop-close"
              aria-label="Fechar"
              onClick={onClose}
            >
              &#215;
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

/* --- Próxima ação --------------------------------------------------------- */

type NextRun = { task: WorkerAssignmentView; at: Date; schedule: string };

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

// Próximas execuções agendadas (automáticas ativas com agenda), por ordem de
// proximidade. Assistidas (sem schedule) e desativadas não entram.
function upcomingRuns(tasks: WorkerAssignmentView[], from: Date, limit: number): NextRun[] {
  const out: NextRun[] = [];
  for (const t of tasks) {
    if (!t.enabled || t.taskType !== "automation" || !t.schedule) continue;
    const at = nextRunAfter(t.schedule, from);
    if (!at) continue;
    out.push({ task: t, at, schedule: t.schedule });
  }
  out.sort((a, b) => a.at.getTime() - b.at.getTime());
  return out.slice(0, limit);
}

const UPCOMING_MAX = 8;

export function NextRunWidget() {
  // Auto-suficiente: busca as próprias atribuições. Tick de 30s para o "daqui
  // a…" não ficar preso e a próxima rolar.
  const [tasks, setTasks] = useState<WorkerAssignmentView[]>([]);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetchMineAssignments()
      .then((t) => {
        if (alive) setTasks(t);
      })
      .catch(() => {
        /* silencioso: o cartão é acessório */
      });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const upcoming = useMemo(
    () => upcomingRuns(tasks, new Date(nowMs), UPCOMING_MAX),
    [tasks, nowMs],
  );
  const next = upcoming[0] ?? null;

  return (
    <section className="wf-tc wf-tc--hero" aria-label="Próxima ação">
      <div className="wf-tc-head">
        <span className="wf-tc-ic">{IcClock}</span>
        <span className="wf-tc-title">Próxima ação</span>
        <button
          type="button"
          className="wf-tc-btn"
          onClick={() => setOpen(true)}
          aria-label="Ver próximas ações"
          title="Ver próximas"
        >
          {IcPlus}
        </button>
      </div>

      {next ? (
        <div className="wf-tc-line">
          <span className="wf-tc-rel">{formatRelative(next.at.getTime() - nowMs)}</span>
          <span className="wf-tc-cap">
            {next.task.taskName} · {describeCron(next.schedule)}
          </span>
        </div>
      ) : (
        <p className="wf-tc-empty">Sem ações agendadas.</p>
      )}

      {open && (
        <CardPopup label="Próximas ações" icon={IcClock} onClose={() => setOpen(false)}>
          <div className="wf-pop-body">
            {upcoming.length === 0 ? (
              <p className="wf-tc-empty">Sem ações agendadas.</p>
            ) : (
              upcoming.map((u) => (
                <div key={u.task.assignmentId} className="wf-pop-next">
                  <span className="wf-pop-next-main">
                    <span className="wf-pop-task">{u.task.taskName}</span>
                    <span className="wf-pop-next-cad">{describeCron(u.schedule)}</span>
                  </span>
                  <span className="wf-pop-next-rel">
                    {formatRelative(u.at.getTime() - nowMs)}
                  </span>
                </div>
              ))
            )}
          </div>
        </CardPopup>
      )}
    </section>
  );
}

/* --- Ações recentes ------------------------------------------------------- */

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

// Busca até 10 (o popup mostra 3/5/10; o cartão mostra só a 1.ª).
const RECENT_MAX = 10;

export function RecentRunsWidget() {
  const [runs, setRuns] = useState<MineRunRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(5);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setRuns(await fetchMineRuns(RECENT_MAX));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const last = runs && runs.length > 0 ? runs[0]! : null;
  const lastPill = last ? runPill(last) : null;
  const shown = runs ? runs.slice(0, limit) : [];

  return (
    <section className="wf-tc" aria-label="Ações recentes">
      <div className="wf-tc-head">
        <span className="wf-tc-ic">{IcHistory}</span>
        <span className="wf-tc-title">Ações recentes</span>
        <button
          type="button"
          className="wf-tc-btn"
          onClick={() => setOpen(true)}
          aria-label="Ver todas as ações"
          title="Ver todas"
        >
          {IcPlus}
        </button>
      </div>

      {error ? (
        <p className="wf-tc-empty">{error}</p>
      ) : runs === null ? (
        <div className="wf-tc-line">
          <span className="wf-tc-skel" />
        </div>
      ) : last === null || lastPill === null ? (
        <p className="wf-tc-empty">Ainda sem ações.</p>
      ) : (
        <div className="wf-tc-line">
          <span className="wf-tc-task">{last.taskName}</span>
          <Pill tone={lastPill.tone} label={lastPill.label} />
          <span className="wf-tc-when">{formatWhen(last.createdAt)}</span>
        </div>
      )}

      {open && (
        <CardPopup
          label="Ações recentes"
          icon={IcHistory}
          onClose={() => setOpen(false)}
          headExtra={
            <button
              type="button"
              className="wf-tc-btn"
              onClick={() => void load()}
              disabled={busy}
              aria-label="Atualizar"
              title="Atualizar"
            >
              {RefreshIcon}
            </button>
          }
        >
          <div className="wf-pop-seg" role="group" aria-label="Quantas mostrar">
            <span className="wf-pop-seg-lbl">Mostrar</span>
            {[3, 5, 10].map((n) => (
              <button
                key={n}
                type="button"
                className={`wf-pop-seg-btn${limit === n ? " on" : ""}`}
                aria-pressed={limit === n}
                onClick={() => setLimit(n)}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="wf-pop-body">
            {shown.length === 0 ? (
              <p className="wf-tc-empty">Ainda sem ações.</p>
            ) : (
              shown.map((run) => {
                const pill = runPill(run);
                return (
                  <div key={run.id} className="wf-pop-item">
                    <span className="wf-pop-task">{run.taskName}</span>
                    <Pill tone={pill.tone} label={pill.label} />
                    <span className="wf-pop-when">{formatWhen(run.createdAt)}</span>
                  </div>
                );
              })
            )}
          </div>
        </CardPopup>
      )}
    </section>
  );
}
