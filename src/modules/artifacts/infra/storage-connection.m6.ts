// Ponte M6 → M8. O M8 define o port (StorageConnectionPort); aqui liga-se às
// worker_connections do M6 para descobrir a cloud de storage do trabalhador e
// resolver o access token válido (via WorkerTokenPort — refresh silencioso).
// O registo de SDKs de cloud (upload real) devolve o SDK do Google Drive.
import { and, desc, eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { tools, workerConnections } from "@/db/schema";
import type { CloudSdk, StorageConnectionPort } from "./cloud-storage.worker-connection";
import { createGoogleDriveSdk } from "@/platform/cloud/google-drive";

// Scopes de escrita conhecidos por ferramenta. Heurística até os SDKs reais
// cobrirem todas (aí a decisão de writeScope passa a ser do próprio provider).
const WRITE_SCOPES: Record<string, string[]> = {
  google: [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/drive.file",
  ],
  microsoft: ["Files.ReadWrite", "Files.ReadWrite.All"],
  dropbox: ["files.content.write"],
};

/** Ferramentas que sabemos usar como storage (têm SDK ou heurística de escrita). */
const KNOWN_CLOUD_KEYS = new Set(Object.keys(WRITE_SCOPES));

function hasWriteScope(toolKey: string, granted: string[]): boolean {
  const known = WRITE_SCOPES[toolKey];
  if (known && known.some((s) => granted.includes(s))) return true;
  // Fallback genérico para ferramentas ainda não catalogadas acima.
  return granted.some((s) => s.toLowerCase().includes("write"));
}

/** Resolve um access token do worker para uma ferramenta (por Tool.key). */
export interface TokenResolver {
  getAccessToken(workerId: string, toolKey: string): Promise<string | null>;
}

/**
 * Resolve a conexão de storage do trabalhador: a worker_connection LIGADA para
 * uma cloud conhecida (a mais recentemente ligada). Já NÃO exige rootFolderRef
 * — quando ele falta, o SDK do Drive garante uma pasta-app própria. O token é
 * resolvido aqui (fronteira), nunca sai para HTTP/UI.
 */
export function createM6StorageConnectionBridge(
  db: PgDatabase<any, any, any>,
  tokens: TokenResolver,
): StorageConnectionPort {
  return {
    async getStorageConnection(workerId: string) {
      const rows = await db
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
          ),
        )
        .orderBy(desc(workerConnections.connectedAt));

      // A cloud é a conexão ligada mais recente cuja ferramenta sabemos usar
      // como storage. (No caso Google, é a mesma conexão do Gmail — a união de
      // scopes inclui drive.file.)
      const row = rows.find((r) => KNOWN_CLOUD_KEYS.has(r.toolKey)) ?? null;
      if (!row) return null;

      const accessToken = await tokens.getAccessToken(workerId, row.toolKey);
      return {
        toolKey: row.toolKey,
        rootFolderRef: row.rootFolderRef,
        writeScope: hasWriteScope(row.toolKey, row.grantedScopes ?? []),
        accessToken,
      };
    },
  };
}

/**
 * Registo de SDKs de cloud por Tool.key. O Google Drive já está ligado; as
 * restantes (Dropbox/OneDrive) aterram quando as suas consolas OAuth estiverem
 * verificadas. Para uma cloud sem SDK, o adapter lança CLOUD_CONNECTION_MISSING.
 */
const googleDrive = createGoogleDriveSdk();

export function defaultCloudSdkRegistry(toolKey: string): CloudSdk | undefined {
  if (toolKey === "google") return googleDrive;
  return undefined;
}
