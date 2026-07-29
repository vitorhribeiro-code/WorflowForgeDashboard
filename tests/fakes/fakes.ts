import type { AuditEvent, AuditPort } from "@/lib/audit";
import type { TaskType } from "@/modules/runs/domain/run.types";
import type {
  AssignmentContext,
  CreateRunInput,
  RunRow,
  RunsRepository,
} from "@/modules/runs/data/runs.repository";
import type {
  ArtifactSink,
  ReadinessChecker,
  ReadinessResult,
  RunQueue,
} from "@/modules/runs/service/ports";

// Contexto de atribuição por defeito, com overrides planos.
export function ctx(
  over: {
    enabled?: boolean;
    type?: TaskType;
    workerId?: string;
    runtime?: string;
    config?: Record<string, unknown> | null;
  } = {},
): AssignmentContext {
  return {
    assignment: {
      id: "asg-1",
      taskId: "task-1",
      workerId: over.workerId ?? "w1",
      enabled: over.enabled ?? true,
      config: over.config ?? null,
    },
    task: {
      id: "task-1",
      orgId: "o1",
      type: over.type ?? "automation",
      runtime: over.runtime ?? "echo",
    },
  };
}

export class FakeRunsRepo implements RunsRepository {
  runs = new Map<string, RunRow>();
  private context: AssignmentContext | null = null;
  private seq = 0;

  seedContext(c: AssignmentContext) {
    this.context = c;
  }
  async getRun(id: string) {
    return this.runs.get(id) ?? null;
  }
  async getAssignmentContext(_assignmentId: string) {
    return this.context;
  }
  async findByIdempotencyKey(key: string) {
    return [...this.runs.values()].find((r) => r.idempotencyKey === key) ?? null;
  }
  async createRun(input: CreateRunInput): Promise<RunRow> {
    const row: RunRow = {
      id: `run-${++this.seq}`,
      assignmentId: input.assignmentId,
      status: "queued",
      trigger: input.trigger,
      idempotencyKey: input.idempotencyKey,
      input: input.input,
      output: input.output,
      error: null,
      triggeredBy: input.triggeredBy,
      startedAt: null,
      finishedAt: null,
      createdAt: new Date("2026-07-22T10:00:00Z"),
    };
    this.runs.set(row.id, row);
    return row;
  }
  async markRunning(id: string, startedAt: Date) {
    const r = this.runs.get(id)!;
    r.status = "running";
    r.startedAt = startedAt;
  }
  async markSuccess(id: string, output: Record<string, unknown>, finishedAt: Date) {
    const r = this.runs.get(id)!;
    r.status = "success";
    r.output = output;
    r.finishedAt = finishedAt;
  }
  async markError(id: string, error: string, output: Record<string, unknown>, finishedAt: Date) {
    const r = this.runs.get(id)!;
    r.status = "error";
    r.error = error;
    r.output = output;
    r.finishedAt = finishedAt;
  }
  async listByAssignment(assignmentId: string, limit: number) {
    return [...this.runs.values()].filter((r) => r.assignmentId === assignmentId).slice(0, limit);
  }
}

export class FakeQueue implements RunQueue {
  enqueued: Array<{ runId: string; delayMs?: number }> = [];
  async enqueue(runId: string, opts?: { delayMs?: number }) {
    this.enqueued.push({ runId, delayMs: opts?.delayMs });
  }
}

export class FakeReadiness implements ReadinessChecker {
  result: ReadinessResult = { ready: true, missing: [] };
  async check() {
    return this.result;
  }
}

export class FakeArtifacts implements ArtifactSink {
  logs: Array<{ runId: string; name: string; body: Record<string, unknown> }> = [];
  docs: Array<{
    runId: string;
    filename: string;
    mimeType: string | null;
    bytes: Uint8Array;
    idempotencyKey?: string;
  }> = [];
  /** Se definido, writeDocument lança-o (para testar falhas de cloud). */
  failDocument?: Error;
  async writeLog(x: { runId: string; name: string; body: Record<string, unknown> }) {
    this.logs.push(x);
  }
  async writeDocument(x: {
    runId: string;
    filename: string;
    mimeType: string | null;
    bytes: Uint8Array;
    idempotencyKey?: string;
  }) {
    if (this.failDocument) throw this.failDocument;
    this.docs.push(x);
    return { id: `doc:${this.docs.length}`, storageRef: `cloud:${this.docs.length}` };
  }
}

export class FakeAudit implements AuditPort {
  entries: AuditEvent[] = [];
  async record(e: AuditEvent) {
    this.entries.push(e);
  }
  actions() {
    return this.entries.map((e) => e.action);
  }
  // Alias para o teste do M6 (usa `audit.events.at(-1)`); mesma lista de `entries`.
  get events(): AuditEvent[] {
    return this.entries;
  }
}

/* -------------------------------------------------------------------------- */
/*  Fakes do M6 — Conexões (usados por tests/connections/*.test.ts)           */
/* -------------------------------------------------------------------------- */

import type {
  OAuthProvider,
  ProviderRegistry,
} from "@/modules/connections/service/oauth.provider";
import type {
  ConnectionStatus,
  OAuthCredentials,
} from "@/modules/connections/domain/connection.types";
import type {
  ConnectionRow,
  ConnectionsRepository,
  RequiredToolRow,
  ToolRow,
  UpsertConnectionInput,
} from "@/modules/connections/data/connections.repository";

/** Provider OAuth em memória: não faz rede, regista o que foi revogado. */
export class FakeProvider implements OAuthProvider {
  refreshShouldThrow = false;
  revoked: string[] = [];

  authorizationUrl(p: { state: string; scopes: string[]; redirectUri: string }): string {
    const u = new URL("https://fake.oauth/authorize");
    u.searchParams.set("state", p.state);
    u.searchParams.set("scope", p.scopes.join(" "));
    u.searchParams.set("redirect_uri", p.redirectUri);
    return u.toString();
  }
  async exchangeCode(_p: { code: string; redirectUri: string }): Promise<OAuthCredentials> {
    return { accessToken: "at", refreshToken: "rt", raw: {} };
  }
  async refresh(refreshToken: string): Promise<OAuthCredentials> {
    if (this.refreshShouldThrow) throw new Error("refresh failed");
    return { accessToken: "new", refreshToken, raw: {} };
  }
  async revoke(token: string): Promise<void> {
    this.revoked.push(token);
  }
}

export class FakeRegistry implements ProviderRegistry {
  constructor(private readonly byKey: Record<string, OAuthProvider>) {}
  get(toolKey: string): OAuthProvider | undefined {
    return this.byKey[toolKey];
  }
}

/** Repositório de conexões em memória. Chaves: `${workerId}:${toolId}`. */
export class FakeRepo implements ConnectionsRepository {
  tools = new Map<string, ToolRow>();
  /** requiredScopesFor: key = `${workerId}:${toolId}` → scopes exigidos. */
  required = new Map<string, string[]>();
  /** listRequiredTools: key = workerId → linhas (tool + scopes). */
  requiredTools = new Map<string, RequiredToolRow[]>();
  suspendCalls: Array<{ workerId: string; toolId: string }> = [];

  private conns = new Map<string, ConnectionRow>();
  private seq = 0;

  async getToolById(toolId: string): Promise<ToolRow | null> {
    return this.tools.get(toolId) ?? null;
  }
  async getConnection(workerId: string, toolId: string): Promise<ConnectionRow | null> {
    return this.conns.get(`${workerId}:${toolId}`) ?? null;
  }
  async listRequiredTools(workerId: string): Promise<RequiredToolRow[]> {
    return this.requiredTools.get(workerId) ?? [];
  }
  async requiredScopesFor(workerId: string, toolId: string): Promise<string[]> {
    return this.required.get(`${workerId}:${toolId}`) ?? [];
  }
  async upsertConnection(input: UpsertConnectionInput): Promise<ConnectionRow> {
    const key = `${input.workerId}:${input.toolId}`;
    const existing = this.conns.get(key);
    const row: ConnectionRow = {
      id: existing?.id ?? `conn-${++this.seq}`,
      workerId: input.workerId,
      toolId: input.toolId,
      grantedScopes: input.grantedScopes,
      credentialsEncrypted: input.credentialsEncrypted,
      status: input.status,
      connectedAt: input.connectedAt,
    };
    this.conns.set(key, row);
    return row;
  }
  async updateStatus(connectionId: string, status: ConnectionStatus): Promise<void> {
    for (const row of this.conns.values()) {
      if (row.id === connectionId) {
        row.status = status;
        return;
      }
    }
  }
  async suspendAssignmentsDependingOn(workerId: string, toolId: string): Promise<number> {
    this.suspendCalls.push({ workerId, toolId });
    return 2;
  }
}
