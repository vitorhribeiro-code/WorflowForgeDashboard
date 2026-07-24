import type { AssignmentReadiness, ConnectionReadiness } from "./types";

// Combina os três pré-requisitos de ativação (regra §6). Puro.
export function evaluateEligibility(input: {
  published: boolean;
  configValid: boolean;
  connections: ConnectionReadiness;
}): AssignmentReadiness {
  return {
    published: input.published,
    configValid: input.configValid,
    connections: input.connections,
    eligible: input.published && input.configValid && input.connections.ready,
  };
}

// Razões legíveis do bloqueio (para a resposta "o que falta" do toggle).
export function blockingReasons(r: AssignmentReadiness): string[] {
  const out: string[] = [];
  if (!r.published) out.push("task_unpublished");
  if (!r.configValid) out.push("config_invalid");
  if (!r.connections.ready) out.push("connections_missing");
  return out;
}
