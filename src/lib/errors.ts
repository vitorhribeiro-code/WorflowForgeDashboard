// Erro de domínio transversal — UNIFICADO para as duas convenções do projeto:
//   (code, message, status:number, details?)   ← M1–M5, M7, M10 (status explícito)
//   (code, message, details:object)             ← M6, M8, M9 (status por mapa)
// O 3.º argumento é interpretado por tipo: número = status, objeto = details.
export class DomainError extends Error {
  public readonly status: number;
  public readonly details?: unknown;

  constructor(
    public readonly code: string,
    message: string,
    statusOrDetails?: number | Record<string, unknown> | unknown,
    details?: unknown,
  ) {
    super(message);
    this.name = "DomainError";
    if (typeof statusOrDetails === "number") {
      this.status = statusOrDetails;
      this.details = details;
    } else {
      this.details = statusOrDetails;
      this.status = STATUS_BY_CODE[code] ?? 400;
    }
  }
}

// Fallback de status por código (quando não é passado explicitamente).
// Inclui os códigos do M6/M8/M9.
const STATUS_BY_CODE: Record<string, number> = {
  FORBIDDEN: 403,
  UNAUTHENTICATED: 401,
  RUN_NOT_FOUND: 404,
  ARTIFACT_NOT_FOUND: 404,
  ARTIFACT_EXPIRED: 410,
  CLOUD_CONNECTION_MISSING: 409,
  CLOUD_WRITE_SCOPE_MISSING: 409,
  TOOL_NOT_FOUND: 404,
  ARCHIVE_NOT_FOUND: 404,
  ARCHIVE_ALREADY_READY: 409,
};

export type HttpError = {
  status: number;
  body: { error: string; message: string; details?: unknown };
};

// -------------------------------------------------------------------------- //
//  Factories de erro (M6/M7). Códigos minúsculos, status explícito.           //
// -------------------------------------------------------------------------- //
export const badInput = (m: string, d?: unknown) => new DomainError("bad_input", m, 400, d);
export const forbidden = (m: string, d?: unknown) => new DomainError("forbidden", m, 403, d);
export const notFound = (m: string, d?: unknown) => new DomainError("not_found", m, 404, d);
export const conflict = (m: string, d?: unknown) => new DomainError("conflict", m, 409, d);
export const notReady = (m: string, d?: unknown) => new DomainError("not_ready", m, 409, d);
export const noHandler = (m: string, d?: unknown) => new DomainError("no_handler", m, 422, d);
export const retryNotAllowed = (m: string, d?: unknown) =>
  new DomainError("retry_not_allowed", m, 409, d);
export const toolNotOAuth = (m: string, d?: unknown) => new DomainError("tool_not_oauth", m, 422, d);
// M6 — Conexões: scopes/OAuth/state.
export const invalidScopes = (m: string, d?: unknown) =>
  new DomainError("invalid_scopes", m, 422, d);
export const oauthDenied = (m: string, d?: unknown) => new DomainError("oauth_denied", m, 403, d);
export const providerError = (m: string, d?: unknown) =>
  new DomainError("provider_error", m, 502, d);
export const stateInvalid = (m: string, d?: unknown) => new DomainError("state_invalid", m, 400, d);

// Mapeia qualquer erro para uma resposta HTTP. Ponto único de tradução.
export function toHttp(err: unknown): HttpError {
  if (err instanceof DomainError) {
    return {
      status: err.status,
      body: { error: err.code, message: err.message, details: err.details },
    };
  }
  return { status: 500, body: { error: "INTERNAL", message: "Erro interno" } };
}
