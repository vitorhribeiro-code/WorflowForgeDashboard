// Adaptador CloudStoragePort: liga o M8 à cloud do trabalhador via M6.
// Resolve a worker_connection usada como storage (root_folder_ref + scope de escrita)
// e delega no SDK da cloud (Google Drive/Dropbox/...). Aqui fica o contrato + os erros.
import { DomainError } from "../../../lib/errors";
import type {
  ArtifactContent,
  CloudStoragePort,
  DownloadTarget,
  StoredBlob,
} from "../service/ports";

/** O que o M8 precisa do M6, exposto como port (definido do lado do M8). */
export interface StorageConnectionPort {
  /**
   * Devolve a conexão de storage do worker, ou null se não existir.
   * writeScope indica se os granted_scopes incluem escrita.
   * accessToken é o token OAuth válido do worker para esta cloud (ou null se
   * não resolúvel — conexão expirada/revogada: precisa de reautorização).
   */
  getStorageConnection(workerId: string): Promise<{
    toolKey: string;
    rootFolderRef: string | null;
    writeScope: boolean;
    accessToken: string | null;
  } | null>;
}

/**
 * SDK genérico de cloud, registado por toolKey (padrão do M6: sem classe por
 * ferramenta). Cada chamada recebe o access token do worker — o SDK é stateless
 * por-worker (o token é resolvido na fronteira, pela ponte M6).
 */
export interface CloudSdk {
  upload(args: {
    accessToken: string;
    rootFolderRef: string | null;
    filename: string;
    mimeType: string | null;
    bytes: Uint8Array;
  }): Promise<{ fileId: string }>;
  signedUrl(accessToken: string, fileId: string): Promise<DownloadTarget>;
}

export function createCloudStorageAdapter(
  connections: StorageConnectionPort,
  sdkByToolKey: (toolKey: string) => CloudSdk | undefined,
): CloudStoragePort {
  async function resolve(workerId: string) {
    const conn = await connections.getStorageConnection(workerId);
    if (!conn) {
      throw new DomainError("CLOUD_CONNECTION_MISSING", "Sem cloud ligada para o trabalhador", {
        workerId,
      });
    }
    if (!conn.writeScope) {
      throw new DomainError("CLOUD_WRITE_SCOPE_MISSING", "Cloud sem scope de escrita", {
        workerId,
        toolKey: conn.toolKey,
      });
    }
    const sdk = sdkByToolKey(conn.toolKey);
    if (!sdk) {
      throw new DomainError("CLOUD_CONNECTION_MISSING", "Sem SDK para a cloud", {
        toolKey: conn.toolKey,
      });
    }
    if (!conn.accessToken) {
      // Conexão ligada mas sem token válido (expirou/revogado e o refresh falhou).
      throw new DomainError("CLOUD_CONNECTION_MISSING", "Cloud sem token válido — reautorizar", {
        workerId,
        toolKey: conn.toolKey,
      });
    }
    return { conn, sdk, accessToken: conn.accessToken };
  }

  return {
    async write(workerId: string, content: ArtifactContent): Promise<StoredBlob> {
      const { conn, sdk, accessToken } = await resolve(workerId);
      const { fileId } = await sdk.upload({
        accessToken,
        rootFolderRef: conn.rootFolderRef,
        filename: content.filename,
        mimeType: content.mimeType,
        bytes: content.bytes,
      });
      return { storageRef: fileId };
    },

    async getDownload(workerId: string, storageRef: string): Promise<DownloadTarget> {
      const { sdk, accessToken } = await resolve(workerId);
      return sdk.signedUrl(accessToken, storageRef);
    },
  };
}
