/**
 * SDK de upload para o Dropbox (implementa o CloudSdk do M8).
 *
 * Grava o entregável final (work_document) na cloud do PRÓPRIO trabalhador, em
 * nome dele, usando o access token resolvido pelo WorkerTokenPort (M6). A app
 * guarda só a REFERÊNCIA (o `id` do ficheiro, ex.: "id:abc…") — nunca o ficheiro.
 *
 * Scope alinhado: `files.content.write` (+ `files.content.read` para o append).
 * Ao contrário do Drive, no Dropbox o CAMINHO é a chave natural: escrever no
 * mesmo path com `mode=overwrite` faz upsert (mata duplicados por período), sem
 * precisar de procurar por metadados nem criar pastas à mão (o upload cria a
 * árvore de pastas do path). Por isso:
 *   - com idempotencyKey → `mode=overwrite` (o filename já encaixa o período,
 *     logo o path é estável e reescreve-se em vez de duplicar);
 *   - sem idempotencyKey  → `mode=add` + `autorename` (cria sempre um novo).
 *
 * Erros (MESMO contrato do Google Drive/aquisição Gmail, para o classify() do M7):
 *   - rede             → TRANSITÓRIO (`.transient = true`) → retry
 *   - HTTP 429/5xx     → TRANSITÓRIO (`.status`)           → retry
 *   - HTTP 401/403/4xx → PERMANENTE (`.status`)            → reautorizar/intervir
 *   - 409 no download  → tratado como "não existe" (não é erro) no appendText
 *
 * Nota de idempotência: numa retentativa transitória o handler recompõe e
 * re-grava — é at-least-once. Com overwrite por path, a re-gravação é inócua
 * (mesmo path, mesmo ficheiro). Sem idempotencyKey (autorename), pode nascer um
 * 2.º ficheiro. Aceitável nesta fatia (igual ao Drive).
 */
import type { CloudSdk } from "@/modules/artifacts/infra/cloud-storage.worker-connection";
import type { DownloadTarget } from "@/modules/artifacts/service/ports";

type FetchLike = typeof fetch;

const UPLOAD_URL = "https://content.dropboxapi.com/2/files/upload";
const DOWNLOAD_URL = "https://content.dropboxapi.com/2/files/download";
const TEMP_LINK_URL = "https://api.dropboxapi.com/2/files/get_temporary_link";

/** Links temporários do Dropbox duram ~4h — reflete-se no expiresAt. */
const TEMP_LINK_TTL_MS = 4 * 60 * 60 * 1000;

/** Pasta-app usada quando o worker não tem uma pasta raiz definida. */
const DEFAULT_APP_FOLDER =
  process.env.DROPBOX_APP_FOLDER_NAME && process.env.DROPBOX_APP_FOLDER_NAME.length > 0
    ? process.env.DROPBOX_APP_FOLDER_NAME
    : "/WorkflowForge";

function transient(message: string): Error {
  return Object.assign(new Error(message), { transient: true });
}
function withStatus(message: string, status: number): Error {
  return Object.assign(new Error(message), { status });
}

/**
 * Serializa o argumento para o header `Dropbox-API-Arg`. Os headers HTTP têm de
 * ser ASCII, por isso qualquer carácter não-ASCII (ex.: "relatório") é escapado
 * como `\uXXXX` — gotcha clássico da API do Dropbox.
 */
export function dropboxApiArg(obj: Record<string, unknown>): string {
  return JSON.stringify(obj).replace(/[\u007f-\uffff]/g, (c) =>
    "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"),
  );
}

/**
 * Monta o path do ficheiro no Dropbox a partir da pasta raiz (ou default) + o
 * filename. Normaliza barras: garante um único "/" de junção, prefixo "/" e sem
 * "/" final na pasta. PURO — testável sem rede.
 */
export function dropboxFilePath(rootFolderRef: string | null, filename: string, appFolder: string): string {
  const folderRaw = rootFolderRef && rootFolderRef.trim().length > 0 ? rootFolderRef : appFolder;
  const folder = ("/" + folderRaw).replace(/\/+/g, "/").replace(/\/$/, "");
  const name = filename.replace(/^\/+/, "");
  return `${folder}/${name}`;
}

interface DropboxDownload {
  bytes: Uint8Array;
  fileId: string | null;
}

export interface DropboxSdkOptions {
  httpFetch?: FetchLike;
  /** Pasta-app quando não há rootFolderRef (path absoluto, ex.: "/WorkflowForge"). */
  appFolderName?: string;
}

export function createDropboxSdk(opts: DropboxSdkOptions = {}): CloudSdk {
  const httpFetch = opts.httpFetch ?? fetch;
  const appFolder = opts.appFolderName ?? DEFAULT_APP_FOLDER;

  /** Chama um endpoint RPC (JSON in/out). Mapeia erros como o Drive. */
  async function rpc(accessToken: string, url: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    let res: Response;
    try {
      res = await httpFetch(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch {
      throw transient("Dropbox inacessível.");
    }
    if (!res.ok) throw withStatus(`Dropbox respondeu ${res.status}.`, res.status);
    return (await res.json().catch(() => ({}))) as Record<string, unknown>;
  }

  /** Escreve bytes num path (content endpoint). Devolve o id do ficheiro. */
  async function putContent(
    accessToken: string,
    path: string,
    mode: "add" | "overwrite",
    mimeType: string | null,
    bytes: Uint8Array,
  ): Promise<string> {
    const arg = dropboxApiArg({
      path,
      mode,
      autorename: mode === "add",
      mute: true,
      strict_conflict: false,
    });
    let res: Response;
    try {
      res = await httpFetch(UPLOAD_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/octet-stream",
          "dropbox-api-arg": arg,
          ...(mimeType ? { "x-content-type": mimeType } : {}),
        },
        body: bytes as unknown as BodyInit,
      });
    } catch {
      throw transient("Dropbox inacessível.");
    }
    if (!res.ok) throw withStatus(`Dropbox respondeu ${res.status}.`, res.status);
    const json = (await res.json().catch(() => ({}))) as { id?: unknown };
    if (typeof json.id !== "string") throw withStatus("Dropbox não devolveu o id do ficheiro.", 502);
    return json.id;
  }

  /**
   * Descarrega o conteúdo de texto de um path. Devolve null quando o ficheiro
   * não existe (409 path/not_found) — para o append poder criar de raiz.
   */
  async function getContent(accessToken: string, path: string): Promise<DropboxDownload | null> {
    let res: Response;
    try {
      res = await httpFetch(DOWNLOAD_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "dropbox-api-arg": dropboxApiArg({ path }),
        },
      });
    } catch {
      throw transient("Dropbox inacessível.");
    }
    if (res.status === 409) return null; // path/not_found → ainda não existe
    if (!res.ok) throw withStatus(`Dropbox respondeu ${res.status}.`, res.status);
    const meta = res.headers?.get?.("dropbox-api-result");
    let fileId: string | null = null;
    if (meta) {
      try {
        const parsed = JSON.parse(meta) as { id?: unknown };
        if (typeof parsed.id === "string") fileId = parsed.id;
      } catch {
        /* metadata ilegível — segue sem id (o upload devolve um novo) */
      }
    }
    const buf = await res.arrayBuffer();
    return { bytes: new Uint8Array(buf), fileId };
  }

  return {
    async upload({ accessToken, rootFolderRef, filename, mimeType, bytes, idempotencyKey }) {
      const path = dropboxFilePath(rootFolderRef, filename, appFolder);
      // Com chave de idempotência → overwrite (upsert por path). Sem chave →
      // add + autorename (cria sempre, sem colidir).
      const mode = idempotencyKey ? "overwrite" : "add";
      const fileId = await putContent(accessToken, path, mode, mimeType, bytes);
      return { fileId };
    },

    async signedUrl(accessToken: string, fileId: string): Promise<DownloadTarget> {
      // O `get_temporary_link` aceita um id ("id:…") como path. Link válido ~4h.
      const res = await rpc(accessToken, TEMP_LINK_URL, { path: fileId });
      const link = res.link;
      if (typeof link !== "string") throw withStatus("Dropbox não devolveu o link temporário.", 502);
      return { url: link, expiresAt: new Date(Date.now() + TEMP_LINK_TTL_MS) };
    },

    // ACRESCENTAR a um ficheiro vivo (ex.: resumos da semana): lê o conteúdo
    // atual (por path) e reescreve com o bloco no fim. Idempotente por `marker`
    // — se o conteúdo já o contém (mesmo resumo gravado 2x), não duplica. O
    // `header` só é usado quando o ficheiro ainda não existe.
    async appendText({ accessToken, rootFolderRef, filename, marker, header, block }) {
      const path = dropboxFilePath(rootFolderRef, filename, appFolder);
      const current = await getContent(accessToken, path);

      if (current) {
        const text = new TextDecoder().decode(current.bytes);
        if (marker && text.includes(marker)) {
          return { fileId: current.fileId ?? path, appended: false };
        }
        const merged = `${text.replace(/\s+$/, "")}\n\n${block}\n`;
        const fileId = await putContent(
          accessToken,
          path,
          "overwrite",
          "text/markdown",
          new TextEncoder().encode(merged),
        );
        return { fileId, appended: true };
      }

      const content = `${header}\n\n${block}\n`;
      const fileId = await putContent(
        accessToken,
        path,
        "overwrite",
        "text/markdown",
        new TextEncoder().encode(content),
      );
      return { fileId, appended: true };
    },
  };
}

export type DropboxSdk = ReturnType<typeof createDropboxSdk>;
