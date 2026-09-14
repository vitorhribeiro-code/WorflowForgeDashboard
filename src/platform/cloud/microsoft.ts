/**
 * SDK de upload para o OneDrive via Microsoft Graph (implementa o CloudSdk do M8).
 *
 * Gémeo do adapter do Dropbox: grava o entregável final (work_document) na cloud
 * do PRÓPRIO trabalhador, em nome dele, com o access token resolvido pelo
 * WorkerTokenPort (M6). A app guarda só a REFERÊNCIA (o `id` do DriveItem) —
 * nunca o ficheiro.
 *
 * Scope alinhado: `Files.ReadWrite` (delegado; o worker consente-o a si próprio).
 * Tal como no Dropbox, no OneDrive o CAMINHO é a chave natural: o endereçamento
 * por path (`root:/{path}:/content`) faz upsert quando se escreve no mesmo path.
 * Por isso:
 *   - com idempotencyKey → `conflictBehavior=replace` (o filename encaixa o
 *     período, logo o path é estável e reescreve-se em vez de duplicar);
 *   - sem idempotencyKey  → `conflictBehavior=rename` (cria sempre um novo).
 *
 * Erros (MESMO contrato do Google Drive/Dropbox, para o classify() do M7):
 *   - rede             → TRANSITÓRIO (`.transient = true`) → retry
 *   - HTTP 429/5xx     → TRANSITÓRIO (`.status`)           → retry
 *   - HTTP 401/403/4xx → PERMANENTE (`.status`)            → reautorizar/intervir
 *   - 404 no download  → tratado como "não existe" (não é erro) no appendText
 *
 * Nota de pastas: o PUT por path do Graph normalmente cria a árvore de pastas
 * sozinho, mas NEM sempre (pode devolver 404 itemNotFound se o pai não existir).
 * Por isso o upload é defensivo: em 404, garante a pasta (POST children,
 * idempotente por 409 nameAlreadyExists) e repete UMA vez. Assim funciona quer o
 * auto-create esteja ativo, quer não.
 *
 * Nota de idempotência: numa retentativa transitória o handler recompõe e
 * re-grava — é at-least-once. Com `replace` por path a re-gravação é inócua
 * (mesmo path). Sem idempotencyKey (rename), pode nascer um 2.º ficheiro.
 * Aceitável nesta fatia (igual ao Drive/Dropbox).
 */
import type { CloudSdk } from "@/modules/artifacts/infra/cloud-storage.worker-connection";
import type { DownloadTarget } from "@/modules/artifacts/service/ports";

type FetchLike = typeof fetch;

const GRAPH = "https://graph.microsoft.com/v1.0";

/**
 * O `@microsoft.graph.downloadUrl` do Graph é pré-autenticado e dura ~1h —
 * reflete-se no expiresAt (como o temporary link ~4h do Dropbox).
 */
const DOWNLOAD_URL_TTL_MS = 60 * 60 * 1000;

/** Pasta-app usada quando o worker não tem uma pasta raiz definida. */
const DEFAULT_APP_FOLDER =
  process.env.MICROSOFT_APP_FOLDER_NAME && process.env.MICROSOFT_APP_FOLDER_NAME.length > 0
    ? process.env.MICROSOFT_APP_FOLDER_NAME
    : "WorkflowForge";

function transient(message: string): Error {
  return Object.assign(new Error(message), { transient: true });
}
function withStatus(message: string, status: number): Error {
  return Object.assign(new Error(message), { status });
}

/**
 * Normaliza a pasta de destino: sem barra à cabeça/cauda, sem duplicadas. No
 * Graph o path é relativo à raiz do drive (NÃO leva "/" inicial). PURO.
 */
export function oneDriveFolderPath(rootFolderRef: string | null, appFolder: string): string {
  const raw = rootFolderRef && rootFolderRef.trim().length > 0 ? rootFolderRef : appFolder;
  return raw.replace(/\/+/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
}

/**
 * Monta o path do ficheiro (pasta + filename), relativo à raiz do drive, sem "/"
 * inicial. PURO — testável sem rede.
 */
export function oneDriveItemPath(
  rootFolderRef: string | null,
  filename: string,
  appFolder: string,
): string {
  const folder = oneDriveFolderPath(rootFolderRef, appFolder);
  const name = filename.replace(/^\/+/, "");
  return folder ? `${folder}/${name}` : name;
}

/**
 * Codifica cada segmento do path para o endereçamento por dois-pontos do Graph
 * (`root:/{path}:/...`), preservando os "/". Cobre espaços/acentos (ex.:
 * "relatório mensal.md"). PURO.
 */
export function graphEncodePath(path: string): string {
  return path
    .split("/")
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

export interface MicrosoftGraphSdkOptions {
  httpFetch?: FetchLike;
  /** Pasta-app quando não há rootFolderRef (path relativo, ex.: "WorkflowForge"). */
  appFolderName?: string;
}

export function createMicrosoftGraphSdk(opts: MicrosoftGraphSdkOptions = {}): CloudSdk {
  const httpFetch = opts.httpFetch ?? fetch;
  const appFolder = opts.appFolderName ?? DEFAULT_APP_FOLDER;

  /** GET/POST JSON (RPC). Mapeia erros como o Drive/Dropbox. */
  async function graphJson(
    accessToken: string,
    url: string,
    init: RequestInit,
  ): Promise<Record<string, unknown>> {
    let res: Response;
    try {
      res = await httpFetch(url, {
        ...init,
        headers: { authorization: `Bearer ${accessToken}`, ...(init.headers ?? {}) },
      });
    } catch {
      throw transient("Microsoft Graph inacessível.");
    }
    if (!res.ok) throw withStatus(`Microsoft Graph respondeu ${res.status}.`, res.status);
    return (await res.json().catch(() => ({}))) as Record<string, unknown>;
  }

  /** Escreve bytes num path (content endpoint). Devolve o id do DriveItem. */
  async function putContentOnce(
    accessToken: string,
    itemPath: string,
    conflictBehavior: "replace" | "rename",
    mimeType: string | null,
    bytes: Uint8Array,
  ): Promise<Response> {
    const url =
      `${GRAPH}/me/drive/root:/${graphEncodePath(itemPath)}:/content` +
      `?%40microsoft.graph.conflictBehavior=${conflictBehavior}`;
    try {
      return await httpFetch(url, {
        method: "PUT",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": mimeType ?? "application/octet-stream",
        },
        body: bytes as unknown as BodyInit,
      });
    } catch {
      throw transient("Microsoft Graph inacessível.");
    }
  }

  /** Cria uma pasta (idempotente). 409 nameAlreadyExists = já existe → OK. */
  async function createFolder(
    accessToken: string,
    parentPath: string,
    name: string,
  ): Promise<void> {
    const url = parentPath
      ? `${GRAPH}/me/drive/root:/${graphEncodePath(parentPath)}:/children`
      : `${GRAPH}/me/drive/root/children`;
    let res: Response;
    try {
      res = await httpFetch(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name,
          folder: {},
          "@microsoft.graph.conflictBehavior": "fail",
        }),
      });
    } catch {
      throw transient("Microsoft Graph inacessível.");
    }
    if (res.status === 409) return; // já existe — idempotente
    if (!res.ok) throw withStatus(`Microsoft Graph respondeu ${res.status}.`, res.status);
  }

  /** Garante a árvore de pastas do `folderPath` (segmento a segmento). */
  async function ensureFolderTree(accessToken: string, folderPath: string): Promise<void> {
    const segments = folderPath.split("/").filter(Boolean);
    let parent = "";
    for (const seg of segments) {
      await createFolder(accessToken, parent, seg);
      parent = parent ? `${parent}/${seg}` : seg;
    }
  }

  /**
   * PUT com fallback: se o pai não existir (404), garante a pasta e repete UMA
   * vez. Devolve o id do DriveItem.
   */
  async function putContent(
    accessToken: string,
    itemPath: string,
    conflictBehavior: "replace" | "rename",
    mimeType: string | null,
    bytes: Uint8Array,
  ): Promise<string> {
    let res = await putContentOnce(accessToken, itemPath, conflictBehavior, mimeType, bytes);
    if (res.status === 404) {
      const folder = itemPath.includes("/") ? itemPath.slice(0, itemPath.lastIndexOf("/")) : "";
      if (folder) await ensureFolderTree(accessToken, folder);
      res = await putContentOnce(accessToken, itemPath, conflictBehavior, mimeType, bytes);
    }
    if (!res.ok) throw withStatus(`Microsoft Graph respondeu ${res.status}.`, res.status);
    const json = (await res.json().catch(() => ({}))) as { id?: unknown };
    if (typeof json.id !== "string") throw withStatus("Graph não devolveu o id do ficheiro.", 502);
    return json.id;
  }

  /**
   * Lê o conteúdo de texto de um path. Devolve null quando o ficheiro não existe
   * (404 itemNotFound) — para o append poder criar de raiz.
   */
  async function getContentText(accessToken: string, itemPath: string): Promise<string | null> {
    const url = `${GRAPH}/me/drive/root:/${graphEncodePath(itemPath)}:/content`;
    let res: Response;
    try {
      res = await httpFetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
    } catch {
      throw transient("Microsoft Graph inacessível.");
    }
    if (res.status === 404) return null; // itemNotFound → ainda não existe
    if (!res.ok) throw withStatus(`Microsoft Graph respondeu ${res.status}.`, res.status);
    return await res.text();
  }

  /** Resolve o id do DriveItem por path (usado no caso raro de append no-op). */
  async function getItemId(accessToken: string, itemPath: string): Promise<string> {
    const url = `${GRAPH}/me/drive/root:/${graphEncodePath(itemPath)}:/?%24select=id`;
    const json = await graphJson(accessToken, url, { method: "GET" });
    if (typeof json.id !== "string") throw withStatus("Graph não devolveu o id do ficheiro.", 502);
    return json.id;
  }

  return {
    async upload({ accessToken, rootFolderRef, filename, mimeType, bytes, idempotencyKey }) {
      const itemPath = oneDriveItemPath(rootFolderRef, filename, appFolder);
      // Com chave de idempotência → replace (upsert por path). Sem chave →
      // rename (cria sempre, sem colidir).
      const conflictBehavior = idempotencyKey ? "replace" : "rename";
      const fileId = await putContent(accessToken, itemPath, conflictBehavior, mimeType, bytes);
      return { fileId };
    },

    async signedUrl(accessToken: string, fileId: string): Promise<DownloadTarget> {
      // O `@microsoft.graph.downloadUrl` é pré-autenticado (~1h), como o
      // temporary link do Dropbox. Vem por defeito no GET do DriveItem.
      const json = await graphJson(accessToken, `${GRAPH}/me/drive/items/${encodeURIComponent(fileId)}`, {
        method: "GET",
      });
      const link = json["@microsoft.graph.downloadUrl"];
      if (typeof link !== "string") throw withStatus("Graph não devolveu o downloadUrl.", 502);
      return { url: link, expiresAt: new Date(Date.now() + DOWNLOAD_URL_TTL_MS) };
    },

    // ACRESCENTAR a um ficheiro vivo (ex.: resumos da semana): lê o conteúdo
    // atual (por path) e reescreve com o bloco no fim. Idempotente por `marker`
    // — se o conteúdo já o contém (mesmo resumo gravado 2x), não duplica. O
    // `header` só é usado quando o ficheiro ainda não existe. Como no Dropbox, o
    // path (rootFolderRef+filename) é a chave — o idempotencyKey não é usado para
    // procurar (o filename já encaixa o período).
    async appendText({ accessToken, rootFolderRef, filename, marker, header, block }) {
      const itemPath = oneDriveItemPath(rootFolderRef, filename, appFolder);
      const current = await getContentText(accessToken, itemPath);

      if (current !== null) {
        if (marker && current.includes(marker)) {
          const fileId = await getItemId(accessToken, itemPath);
          return { fileId, appended: false };
        }
        const merged = `${current.replace(/\s+$/, "")}\n\n${block}\n`;
        const fileId = await putContent(
          accessToken,
          itemPath,
          "replace",
          "text/markdown",
          new TextEncoder().encode(merged),
        );
        return { fileId, appended: true };
      }

      const content = `${header}\n\n${block}\n`;
      const fileId = await putContent(
        accessToken,
        itemPath,
        "replace",
        "text/markdown",
        new TextEncoder().encode(content),
      );
      return { fileId, appended: true };
    },
  };
}

export type MicrosoftGraphSdk = ReturnType<typeof createMicrosoftGraphSdk>;
