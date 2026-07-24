import type { AuditLogRow, Paginated } from "../domain/types";

type Props = {
  page: Paginated<AuditLogRow> | null;
  loading?: boolean;
  onPageChange?: (page: number) => void;
};

// Componente presentacional puro: não conhece endpoints, só rende props.
export function AuditLogTable({ page, loading, onPageChange }: Props) {
  if (loading && !page) return <div className="audit-skeleton">A carregar…</div>;
  if (!page || page.items.length === 0) {
    return <div className="audit-empty">Sem registos de auditoria neste filtro.</div>;
  }

  return (
    <div className="audit-table">
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Ator</th>
            <th>Ação</th>
            <th>Entidade</th>
          </tr>
        </thead>
        <tbody>
          {page.items.map((row) => (
            <tr key={row.id}>
              <td>{row.createdAt.toLocaleString?.() ?? String(row.createdAt)}</td>
              <td title={row.actorId ?? "—"}>{row.actorEmail ?? row.actorName ?? "—"}</td>
              <td>
                <code>{row.action}</code>
              </td>
              <td>
                {row.entity}
                {row.entityId ? <span className="audit-entity-id"> · {row.entityId}</span> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <footer className="audit-pager">
        <button
          disabled={page.page <= 1}
          onClick={() => onPageChange?.(page.page - 1)}
        >
          Anterior
        </button>
        <span>
          Página {page.page} de {page.totalPages} · {page.total} registos
        </span>
        <button
          disabled={page.page >= page.totalPages}
          onClick={() => onPageChange?.(page.page + 1)}
        >
          Seguinte
        </button>
      </footer>
    </div>
  );
}
