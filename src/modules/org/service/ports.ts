import type { Role } from "@/lib/session";

// Estes ports são consumidos por M1 (auth), M5 (assignments) e M9 (archives).
// O M2 é o dono de users/org, logo é quem os fornece. As interfaces são
// estruturalmente compatíveis com as declaradas por cada consumidor.

// M1: procura de utilizadores para autenticação.
export type DirectoryUser = { id: string; orgId: string; role: Role; suspended: boolean };
export interface UserDirectoryPort {
  findByEmail(email: string): Promise<DirectoryUser | null>;
  findById(id: string): Promise<DirectoryUser | null>;
}

// M5/M9: resolução worker→org e listagem de workers de uma org.
export interface WorkerDirectoryPort {
  getWorkerOrg(workerId: string): Promise<string | null>;
  listWorkers(orgId: string): Promise<Array<{ id: string; orgId: string }>>;
}
