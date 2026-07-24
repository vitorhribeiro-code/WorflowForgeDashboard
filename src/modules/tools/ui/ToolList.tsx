import type { Tool } from "../domain/types";

type Props = {
  tools: Tool[] | null;
  loading?: boolean;
  onEdit?: (tool: Tool) => void;
};

// Presentacional puro: recebe dados por props, não conhece endpoints.
export function ToolList({ tools, loading, onEdit }: Props) {
  if (loading && !tools) return <div className="tools-skeleton">A carregar…</div>;
  if (!tools || tools.length === 0) {
    return <div className="tools-empty">Sem ferramentas no catálogo. Criar a primeira.</div>;
  }

  return (
    <table className="tools-table">
      <thead>
        <tr>
          <th>Nome</th>
          <th>key</th>
          <th>Auth</th>
          <th>Scopes</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {tools.map((t) => (
          <tr key={t.id}>
            <td>{t.name}</td>
            <td>
              <code>{t.key}</code>
            </td>
            <td>{t.authType}</td>
            <td>{t.availableScopes.length}</td>
            <td>
              <button type="button" onClick={() => onEdit?.(t)}>
                Editar
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
