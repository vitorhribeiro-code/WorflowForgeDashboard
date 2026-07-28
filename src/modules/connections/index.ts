// Superfície pública do M6 — Conexões do Trabalhador.
export { getConnectionsService, getWorkerTokenPort } from "./container";
export type { ConnectionsService } from "./service/connections.service";
export type { WorkerTokenPort } from "./service/worker-token";

// Portos e adaptadores (para o composition root e o cruzamento com M5/M8).
export { createConnectionsService } from "./service/connections.service";
export { createDrizzleConnectionsRepository } from "./data/connections.repository";
export type { ConnectionsRepository } from "./data/connections.repository";
export type {
  ConnectionView,
  ConnectionStatus,
  ToolAuthType,
  OAuthCredentials,
} from "./domain/connection.types";
export { computeReady } from "./domain/connection.types";
export {
  isSubset,
  missingScopes,
  normalizeScopes,
  unionScopes,
} from "./domain/scopes";
