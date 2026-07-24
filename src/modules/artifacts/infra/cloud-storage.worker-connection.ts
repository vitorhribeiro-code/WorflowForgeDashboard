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
   */
  getStorageConnection(workerId: string): Promise<{
    toolKey: string;
    rootFolderRef: string | null;
    writeScope: boolean;
  } | null>;
}

/** SDK genérico de cloud, registado por toolKey (padrão do M6: sem classe por ferramenta). */
export interface CloudSdk {
  upload(args: {
    rootFolderRef: string | null;
    filename: string;
    mimeType: string | null;
    bytes: Uint8Array;
  }): Promise<{ fileId: string }>;
  signedUrl(fileId: string): Promise<DownloadTarget>;
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
    return { conn, sdk };
  }

  return {
    async write(workerId: string, content: ArtifactContent): Promise<StoredBlob> {
      const { conn, sdk } = await resolve(workerId);
      const { fileId } = await sdk.upload({
        rootFolderRef: conn.rootFolderRef,
        filename: content.filename,
        mimeType: content.mimeType,
        bytes: content.bytes,
      });
      return { storageRef: fileId };
    },

    async getDownload(workerId: string, storageRef: string): Promise<DownloadTarget> {
      const { sdk } = await resolve(workerId);
      return sdk.signedUrl(storageRef);
    },
  };
}
