/**
 * Portos de saída do M6 (as interfaces que a service consome por injeção).
 * RECONSTRUÍDO seguindo o padrão dos outros módulos (M5/M7): o service depende
 * só destes contratos; os adaptadores reais (Drizzle, provider genérico, cifra)
 * são ligados no container.ts.
 *
 * Reúne num só sítio o que estava disperso pelos ficheiros do núcleo, para dar
 * uma superfície única e testável.
 */

export type { ConnectionsRepository } from "../data/connections.repository";
export type {
  ToolRow,
  ConnectionRow,
  RequiredToolRow,
  UpsertConnectionInput,
} from "../data/connections.repository";

export type { Cipher } from "./crypto";
export type {
  OAuthProvider,
  ProviderRegistry,
  StateSigner,
  OAuthProviderConfig,
} from "./oauth.provider";

// Portos partilhados (libs canónicas) — reexportados por conveniência do módulo.
export type { AuditPort } from "@/lib/audit";
export type { SessionContext } from "@/lib/session";

export type {
  ConnectionsService,
  ConnectionsServiceDeps,
} from "./connections.service";
