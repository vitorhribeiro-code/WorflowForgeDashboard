import type { Task } from "../domain/types";

type Props = {
  tasks: Task[] | null;
  loading?: boolean;
  onEdit?: (task: Task) => void;
};

export function TaskList({ tasks, loading, onEdit }: Props) {
  if (loading && !tasks) return <div className="tasks-skeleton">A carregar…</div>;
  if (!tasks || tasks.length === 0) {
    return <div className="tasks-empty">Sem tarefas. Criar a primeira.</div>;
  }
  return (
    <table className="tasks-table">
      <thead>
        <tr>
          <th>Nome</th>
          <th>Tipo</th>
          <th>Runtime</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {tasks.map((t) => (
          <tr key={t.id}>
            <td>{t.name}</td>
            <td>{t.type}</td>
            <td>
              <code>{t.runtime}</code>
            </td>
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
