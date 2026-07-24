import type { OperationalMetrics } from "../domain/types";

type Props = { metrics: OperationalMetrics | null; loading?: boolean };

function pct(v: number | null): string {
  return v === null ? "—" : `${Math.round(v * 100)}%`;
}
function ms(v: number | null): string {
  return v === null ? "—" : `${v} ms`;
}

// Cartão simples reutilizável.
function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="metric-card">
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
    </div>
  );
}

// Painel presentacional puro.
export function MetricsPanel({ metrics, loading }: Props) {
  if (loading && !metrics) return <div className="metrics-skeleton">A carregar…</div>;
  if (!metrics) return <div className="metrics-empty">Sem dados no período.</div>;

  const { runs, latency, connections } = metrics;

  return (
    <div className="metrics-panel">
      <section className="metrics-runs">
        <Metric label="Runs (total)" value={runs.total} />
        <Metric label="Taxa de sucesso" value={pct(runs.successRate)} />
        <Metric label="Sucesso" value={runs.byStatus.success} />
        <Metric label="Erro" value={runs.byStatus.error} />
        <Metric label="Em fila" value={runs.byStatus.queued} />
        <Metric label="A correr" value={runs.byStatus.running} />
      </section>

      <section className="metrics-latency">
        <Metric label="Latência p50" value={ms(latency.p50Ms)} />
        <Metric label="Latência p95" value={ms(latency.p95Ms)} />
        <Metric label="Latência média" value={ms(latency.avgMs)} />
      </section>

      <section className="metrics-connections">
        <Metric label="Conexões OK" value={connections.healthy} />
        <Metric label="Conexões com problema" value={connections.problem} />
        <Metric label="Conexões pendentes" value={connections.pending} />
      </section>
    </div>
  );
}
