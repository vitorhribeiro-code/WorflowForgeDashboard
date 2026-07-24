import type { AssignmentReadiness, TaskAssignment } from "../domain/types";

type Props = {
  assignment: TaskAssignment;
  readiness?: AssignmentReadiness;
  onToggle?: (enabled: boolean) => void;
};

// Semáforo: verde = pronto; âmbar = faltam scopes; vermelho = sem conexão/config.
function light(r?: AssignmentReadiness): "green" | "amber" | "red" | "grey" {
  if (!r) return "grey";
  if (r.eligible) return "green";
  const onlyScopes =
    r.published &&
    r.configValid &&
    r.connections.missing.every((m) => m.reason === "missing_scopes");
  return onlyScopes ? "amber" : "red";
}

// Presentacional puro: mostra o toggle e a prontidão; a lógica vem por props.
export function AssignmentCell({ assignment, readiness, onToggle }: Props) {
  const status = light(readiness);
  return (
    <div className={`assignment-cell status-${status}`}>
      <span className="readiness-dot" aria-label={status} />
      <label className="assignment-toggle">
        <input
          type="checkbox"
          checked={assignment.enabled}
          onChange={(e) => onToggle?.(e.target.checked)}
        />
        {assignment.enabled ? "Ativa" : "Inativa"}
      </label>
      {readiness && !readiness.eligible ? (
        <ul className="readiness-missing">
          {!readiness.published ? <li>Task despublicada</li> : null}
          {!readiness.configValid ? <li>config inválida</li> : null}
          {readiness.connections.missing.map((m) => (
            <li key={m.toolId}>
              {m.toolId}: {m.reason}
              {m.missingScopes?.length ? ` (${m.missingScopes.join(", ")})` : ""}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
