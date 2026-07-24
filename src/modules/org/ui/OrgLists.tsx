import type { FunctionalArea, User } from "../domain/types";

export function AreaList({
  areas,
  onRemove,
}: {
  areas: FunctionalArea[] | null;
  onRemove?: (id: string) => void;
}) {
  if (!areas) return <div className="areas-skeleton">A carregar…</div>;
  if (areas.length === 0) return <div className="areas-empty">Sem áreas. Criar a primeira.</div>;
  return (
    <ul className="area-list">
      {areas.map((a) => (
        <li key={a.id}>
          <span>{a.name}</span>
          <button type="button" onClick={() => onRemove?.(a.id)}>
            Remover
          </button>
        </li>
      ))}
    </ul>
  );
}

export function UserList({
  users,
  onToggleSuspended,
}: {
  users: User[] | null;
  onToggleSuspended?: (id: string, suspended: boolean) => void;
}) {
  if (!users) return <div className="users-skeleton">A carregar…</div>;
  if (users.length === 0) return <div className="users-empty">Sem utilizadores.</div>;
  return (
    <table className="user-table">
      <thead>
        <tr>
          <th>Email</th>
          <th>Role</th>
          <th>Estado</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {users.map((u) => (
          <tr key={u.id}>
            <td>{u.email}</td>
            <td>{u.role}</td>
            <td>{u.suspended ? "Suspenso" : "Ativo"}</td>
            <td>
              <button type="button" onClick={() => onToggleSuspended?.(u.id, !u.suspended)}>
                {u.suspended ? "Reativar" : "Desativar"}
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
