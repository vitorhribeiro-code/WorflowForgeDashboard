// Ponte M6 → M8. O M8 define o port (StorageConnectionPort); aqui liga-se às
// worker_connections do M6 para descobrir a cloud de storage do trabalhador.
// O registo de SDKs de cloud (upload real para Google Drive/Dropbox/...) é
// infra Tier-2 e ainda não existe — fica um registo vazio, documentado.
import { and, desc, eq, isNotNull } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { tools, workerConnections } from "@/db/schema";
import type { CloudSdk, StorageConnectionPort } from "./cloud-storage.worker-connection";

// Scopes de escrita conhecidos por ferramenta. Heurística até os SDKs reais
// aterrarem (aí a decisão de writeScope passa a ser do próprio SDK/provider).
const WRITE_SCOPES: Record<string, string[]> = {
  google: [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/drive.file",
  ],
  microsoft: ["Files.ReadWrite", "Files.ReadWrite.All"],
  dropbox: ["files.content.write"],
};

function hasWriteScope(toolKey: string, granted: string[]): boolean {
  const known = WRITE_SCOPES[toolKey];
  if (known && known.some((s) => granted.includes(s))) return true;
  // Fallback genérico para ferramentas ainda não catalogadas acima.
  return granted.some((s) => s.toLowerCase().includes("write"));
}

/**
 * Resolve a conexão de storage do trabalhador: a worker_connection ligada que
 * tem uma pasta raiz definida (root_folder_ref). Se houver mais que uma, a mais
 * recentemente ligada.
 */
export function createM6StorageConnectionBridge(
  db: PgDatabase<any, any, any>,
): StorageConnectionPort {
  return {
    async getStorageConnection(workerId: string) {
      const [row] = await db
        .select({
          toolKey: tools.key,
          rootFolderRef: workerConnections.rootFolderRef,
          grantedScopes: workerConnections.grantedScopes,
        })
        .from(workerConnections)
        .innerJoin(tools, eq(tools.id, workerConnections.toolId))
        .where(
          and(
            eq(workerConnections.workerId, workerId),
            eq(workerConnections.status, "connected"),
            isNotNull(workerConnections.rootFolderRef),
          ),
        )
        .orderBy(desc(workerConnections.connectedAt))
        .limit(1);

      if (!row) return null;
      return {
        toolKey: row.toolKey,
        rootFolderRef: row.rootFolderRef,
        writeScope: hasWriteScope(row.toolKey, row.grantedScopes ?? []),
      };
    },
  };
}

/**
 * Registo de SDKs de cloud por Tool.key. VAZIO por agora: os SDKs de upload
 * (Google Drive, Dropbox, OneDrive) são infra Tier-2 — dependem da verificação
 * das consolas OAuth, que demora semanas (ver handoff §5). Enquanto não
 * existirem, o tier `work_document` (docs na cloud do trabalhador) lança
 * CLOUD_CONNECTION_MISSING; os tiers `intermediate`/logs (S3 efémero) funcionam.
 */
export function defaultCloudSdkRegistry(_toolKey: string): CloudSdk | undefined {
  return undefined;
}
