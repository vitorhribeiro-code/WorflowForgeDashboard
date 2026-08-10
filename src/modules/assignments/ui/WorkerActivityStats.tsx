"use client";

/**
 * "A tua atividade" — os contadores (Tarefas ativas / Prontas / A precisar de
 * ligação) que antes viviam no topo do painel. Passaram para as Definições
 * pessoais do trabalhador. Auto-suficiente: busca as próprias atribuições
 * (mesma fonte do painel), por isso os números estão sempre ao vivo.
 * Reaproveita o visual dos stat cards (.wf-stats / .wf-stat).
 */

import { useEffect, useState } from "react";
import type { WorkerAssignmentView } from "@/modules/assignments";
import { fetchMineAssignments } from "./use-worker-tasks";

const IcActive = (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M9 11l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="4" y="4" width="16" height="16" rx="4" stroke="currentColor" strokeWidth="1.7" />
  </svg>
);
const IcReady = (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
    <path d="M8.5 12.2l2.3 2.3 4.7-4.9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IcPlug = (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M9 15l6-6M8.5 10.5l-1.8 1.8a3.1 3.1 0 004.4 4.4l1.8-1.8M15.5 13.5l1.8-1.8a3.1 3.1 0 00-4.4-4.4L11.1 9.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);

export function WorkerActivityStats() {
  const [tasks, setTasks] = useState<WorkerAssignmentView[] | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchMineAssignments()
      .then((t) => {
        if (alive) setTasks(t);
      })
      .catch(() => {
        if (alive) setTasks([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const list = tasks ?? [];
  const active = list.filter((t) => t.enabled).length;
  const ready = list.filter((t) => t.enabled && t.ready).length;
  const attention = list.filter((t) => t.enabled && !t.ready).length;

  return (
    <div className="wf-stats">
      <div className="wf-stat wf-hero">
        <span className="wf-stat-ic">{IcActive}</span>
        <span className="wf-stat-main">
          <span className="wf-stat-label">Tarefas ativas</span>
          <span className="wf-stat-num">{active}</span>
        </span>
      </div>
      <div className="wf-stat">
        <span className="wf-stat-ic">{IcReady}</span>
        <span className="wf-stat-main">
          <span className="wf-stat-label">Prontas</span>
          <span className="wf-stat-num">{ready}</span>
        </span>
      </div>
      <div className="wf-stat">
        <span className="wf-stat-ic">{IcPlug}</span>
        <span className="wf-stat-main">
          <span className="wf-stat-label">A precisar de ligação</span>
          <span className="wf-stat-num">{attention}</span>
        </span>
      </div>
    </div>
  );
}
