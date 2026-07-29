/**
 * SDK de upload para o Google Drive (implementa o CloudSdk do M8).
 *
 * Grava o entregável final (work_document) na cloud do PRÓPRIO trabalhador, em
 * nome dele, usando o access token resolvido pelo WorkerTokenPort (M6). A app
 * guarda só a REFERÊNCIA (fileId) — nunca o ficheiro.
 *
 * Scope alinhado: `drive.file`. Este scope só dá acesso a ficheiros que a app
 * criou/abriu — por isso:
 *   - o `files.list` só devolve o que ESTA app criou (logo, procurar a pasta-app
 *     por nome é seguro e determinístico);
 *   - criar ficheiros dentro de uma pasta que a app criou é permitido.
 * Quando não há `rootFolderRef` definido, garantimos uma pasta-app própria
 * (default "WorkflowForge") e gravamos lá dentro.
 *
 * Erros (mesmo contrato da aquisição Gmail, para o classify() do M7):
 *   - rede            → TRANSITÓRIO (`.transient = true`)  → retry
 *   - HTTP 429/5xx    → TRANSITÓRIO (`.status`)            → retry
 *   - HTTP 401/403/4xx→ PERMANENTE (`.status`)             → reautorizar/intervir
 *
 * Nota de idempotência: numa retentativa transitória o handler recompõe e
 * re-grava — é at-least-once, pode criar um 2.º ficheiro no Drive se o upload
 * anterior tiver passado antes da falha de rede. Aceitável nesta fatia.
 */
import type { CloudSdk } from "@/modules/artifacts/infra/cloud-storage.worker-connection";
import type { DownloadTarget } from "@/modules/artifacts/service/ports";

type FetchLike = typeof fetch;

const DRIVE_API = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const FOLDER_MIME = "application/vnd.google-apps.folder";

/** Nome da pasta-app usada quando o worker não tem uma pasta raiz definida. */
const DEFAULT_APP_FOLDER =
  process.env.DRIVE_APP_FOLDER_NAME && process.env.DRIVE_APP_FOLDER_NAME.length > 0
    ? process.env.DRIVE_APP_FOLDER_NAME
    : "WorkflowForge";

function transient(message: string): Error {
  return Object.assign(new Error(message), { transient: true });
}
function withStatus(message: string, status: number): Error {
  return Object.assign(new Error(message), { status });
}

async function driveFetch(
  httpFetch: FetchLike,
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
    throw transient("Google Drive inacessível.");
  }
  if (!res.ok) {
    // 429/5xx → transitório; 401/403/outros → permanente (via classify()).
    throw withStatus(`Google Drive respondeu ${res.status}.`, res.status);
  }
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

/** Monta o corpo multipart/related (metadata JSON + media binária) num só buffer. */
export function buildMultipartBody(
  metadata: Record<string, unknown>,
  mimeType: string,
  bytes: Uint8Array,
): { body: Uint8Array; contentType: string } {
  const boundary = `wff-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
  const enc = new TextEncoder();
  const preamble = enc.encode(
    `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`,
  );
  const epilogue = enc.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(preamble.length + bytes.length + epilogue.length);
  body.set(preamble, 0);
  body.set(bytes, preamble.length);
  body.set(epilogue, preamble.length + bytes.length);
  return { body, contentType: `multipart/related; boundary=${boundary}` };
}

function asFileId(v: unknown): string | null {
  const r = v as { id?: unknown } | null;
  return r && typeof r.id === "string" ? r.id : null;
}

/** Escapa aspas simples para embutir num valor de query do Drive. */
function esc(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export interface GoogleDriveSdkOptions {
  httpFetch?: FetchLike;
  /** Nome da pasta-app quando não há rootFolderRef. */
  appFolderName?: string;
}

export function createGoogleDriveSdk(opts: GoogleDriveSdkOptions = {}): CloudSdk {
  const httpFetch = opts.httpFetch ?? fetch;
  const appFolderName = opts.appFolderName ?? DEFAULT_APP_FOLDER;

  /** Procura a pasta-app (criada por esta app) ou cria-a. Devolve o id. */
  async function ensureAppFolder(accessToken: string): Promise<string> {
    const q =
      `mimeType='${FOLDER_MIME}' and name='${esc(appFolderName)}'` + ` and trashed=false`;
    const listUrl = new URL(DRIVE_API);
    listUrl.searchParams.set("q", q);
    listUrl.searchParams.set("spaces", "drive");
    listUrl.searchParams.set("fields", "files(id,name)");
    listUrl.searchParams.set("pageSize", "1");

    const found = await driveFetch(httpFetch, accessToken, listUrl.toString(), {
      method: "GET",
    });
    const files = Array.isArray(found.files) ? found.files : [];
    const existing = files.length > 0 ? asFileId(files[0]) : null;
    if (existing) return existing;

    const created = await driveFetch(
      httpFetch,
      accessToken,
      `${DRIVE_API}?fields=id`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: appFolderName, mimeType: FOLDER_MIME }),
      },
    );
    const id = asFileId(created);
    if (!id) throw withStatus("Google Drive não devolveu o id da pasta.", 502);
    return id;
  }

  /** Encontra um ficheiro anterior marcado com esta chave de idempotência. */
  async function findByKey(accessToken: string, key: string): Promise<string | null> {
    const q =
      `appProperties has { key='wffKey' and value='${esc(key)}' } and trashed=false`;
    const url = new URL(DRIVE_API);
    url.searchParams.set("q", q);
    url.searchParams.set("spaces", "drive");
    url.searchParams.set("fields", "files(id)");
    url.searchParams.set("pageSize", "1");
    const res = await driveFetch(httpFetch, accessToken, url.toString(), { method: "GET" });
    const files = Array.isArray(res.files) ? res.files : [];
    return files.length > 0 ? asFileId(files[0]) : null;
  }

  /** Grava media (multipart) num ficheiro — cria (POST) ou atualiza (PATCH). */
  async function putMedia(
    accessToken: string,
    args: {
      fileId?: string;
      metadata: Record<string, unknown>;
      mimeType: string | null;
      bytes: Uint8Array;
    },
  ): Promise<string> {
    const { body, contentType } = buildMultipartBody(
      args.metadata,
      args.mimeType ?? "application/octet-stream",
      args.bytes,
    );
    const base = args.fileId ? `${DRIVE_UPLOAD}/${args.fileId}` : DRIVE_UPLOAD;
    const url = new URL(base);
    url.searchParams.set("uploadType", "multipart");
    url.searchParams.set("fields", "id");
    const res = await driveFetch(httpFetch, accessToken, url.toString(), {
      method: args.fileId ? "PATCH" : "POST",
      headers: { "content-type": contentType },
      body: body as unknown as BodyInit,
    });
    const id = asFileId(res) ?? args.fileId ?? null;
    if (!id) throw withStatus("Google Drive não devolveu o id do ficheiro.", 502);
    return id;
  }

  return {
    async upload({ accessToken, rootFolderRef, filename, mimeType, bytes, idempotencyKey }) {
      // UPSERT: se já existe um ficheiro com esta chave, reescreve-o (media +
      // nome) em vez de criar um novo — mata os duplicados por (tarefa, período).
      if (idempotencyKey) {
        const existing = await findByKey(accessToken, idempotencyKey);
        if (existing) {
          // No update NÃO se manda `parents` no corpo (usaria addParents/removeParents).
          const fileId = await putMedia(accessToken, {
            fileId: existing,
            metadata: { name: filename, appProperties: { wffKey: idempotencyKey } },
            mimeType,
            bytes,
          });
          return { fileId };
        }
      }

      const parentId = rootFolderRef ?? (await ensureAppFolder(accessToken));
      const metadata: Record<string, unknown> = { name: filename, parents: [parentId] };
      if (idempotencyKey) metadata.appProperties = { wffKey: idempotencyKey };
      const fileId = await putMedia(accessToken, { metadata, mimeType, bytes });
      return { fileId };
    },

    async signedUrl(_accessToken: string, fileId: string): Promise<DownloadTarget> {
      // O Drive não emite URLs assinados ao estilo S3. Como o entregável vive na
      // Drive do PRÓPRIO trabalhador, o link de visualização abre para o dono
      // (autenticado na Google). Sem expiração — segue a política da cloud.
      return { url: `https://drive.google.com/file/d/${fileId}/view` };
    },
  };
}

export type GoogleDriveSdk = ReturnType<typeof createGoogleDriveSdk>;
