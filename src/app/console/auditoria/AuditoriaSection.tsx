"use client";

import { useMemo, useState } from "react";
import { MetricsPanel } from "@/modules/audit/ui/MetricsPanel";
import { AuditLogTable } from "@/modules/audit/ui/AuditLogTable";
import { useAuditLogs, useOperationalMetrics } from "@/modules/audit/ui/hooks";

const PAGE_SIZE = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

const PERIODS = [
  { days: 7, label: "Últimos 7 dias" },
  { days: 30, label: "Últimos 30 dias" },
  { days: 90, label: "Últimos 90 dias" },
] as const;

export function AuditoriaSection() {
  // --- Métricas: período estável por `days` (senão new Date() refetchava sem fim).
  const [days, setDays] = useState<number>(30);
  const range = useMemo(
    () => ({ from: new Date(Date.now() - days * DAY_MS), to: new Date() }),
    [days],
  );
  const metrics = useOperationalMetrics(range);

  // --- Auditoria: inputs locais vs filtros aplicados (só refetch ao aplicar).
  const [actionInput, setActionInput] = useState("");
  const [entityInput, setEntityInput] = useState("");
  const [applied, setApplied] = useState<{ action?: string; entity?: string }>({});
  const [page, setPage] = useState(1);

  const filter = useMemo(
    () => ({ ...applied, page, pageSize: PAGE_SIZE }),
    [applied, page],
  );
  const logs = useAuditLogs(filter);

  function applyFilters() {
    setApplied({
      action: actionInput.trim() || undefined,
      entity: entityInput.trim() || undefined,
    });
    setPage(1);
  }

  function clearFilters() {
    setActionInput("");
    setEntityInput("");
    setApplied({});
    setPage(1);
  }

  return (
    <section className="console-section">
      <h1>Auditoria &amp; Métricas</h1>
      <p className="muted">
        A saúde das automações e o rasto de todas as ações sensíveis da organização. As
        métricas cobrem o período escolhido; o registo de auditoria é imutável e cresce só por
        acrescento.
      </p>

      {metrics.error ? <p className="panel-error">{metrics.error}</p> : null}

      <div className="panel">
        <div className="panel-head">
          <h2>Operação</h2>
          <label className="period-select">
            Período
            <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {PERIODS.map((p) => (
                <option key={p.days} value={p.days}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <MetricsPanel metrics={metrics.data} loading={metrics.loading} />
      </div>

      <div className="panel">
        <h2>Registo de auditoria</h2>

        <div className="audit-filters">
          <label>
            Ação
            <input
              value={actionInput}
              placeholder="ex.: assignment.enabled"
              onChange={(e) => setActionInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyFilters()}
            />
          </label>
          <label>
            Entidade
            <input
              value={entityInput}
              placeholder="ex.: task_assignment"
              onChange={(e) => setEntityInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyFilters()}
            />
          </label>
          <div className="audit-filters-actions">
            <button type="button" onClick={applyFilters}>
              Aplicar filtros
            </button>
            <button type="button" className="btn-secondary" onClick={clearFilters}>
              Limpar
            </button>
          </div>
        </div>

        {logs.error ? <p className="panel-error">{logs.error}</p> : null}

        <AuditLogTable page={logs.data} loading={logs.loading} onPageChange={setPage} />
      </div>
    </section>
  );
}
