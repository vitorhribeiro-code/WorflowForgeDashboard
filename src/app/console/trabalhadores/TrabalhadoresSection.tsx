"use client";

/**
 * Consola «Trabalhadores» — ficha por-trabalhador que agrega, num só sítio, o
 * que hoje está espalhado: atividade das tarefas, estilo de escrita (+ selo) e
 * conexões. Vive na app ESCURA (fora de `.wf-app`), por isso NÃO usa tokens
 * `--wf-*` nem reaproveita o `WorkerActivityStats` (esse é do painel claro);
 * usa as classes de consola (`.panel`, `.user-table`) + `.wk-*` próprias.
 *
 * Fontes de leitura (sem esquema novo):
 *  - atividade + «usar estilo»: derivados das cells da matriz (/api/assignments/matrix).
 *  - estilo de escrita: GET /api/workers/:id/writing-style (presença + metadados).
 *  - conexões: GET /api/workers/:id/connections (leitura admin; nunca tokens).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { WritingStyleModal } from "@/modules/writing-styles/ui/WritingStyleModal";
import {
  BACKGROUND_SWATCHES,
  fontOptionFor,
  type BackgroundToken,
  type ModeToken,
  type FontToken,
} from "@/modules/preferences/domain/preferences";

/* --- Formas do JSON das APIs (espelham as views do servidor) --------------- */

type TaskType = "automation" | "assistant";

type MatrixTask = {
  id: string;
  name: string;
  type: TaskType;
  runtime: string;
  published: boolean;
};
type MatrixWorker = { id: string; email: string };
type MatrixCell = {
  taskId: string;
  workerId: string;
  assignmentId: string | null;
  enabled: boolean;
  useWritingStyle: boolean;
  schedule: string | null;
  readiness: { eligible: boolean };
};
type Matrix = { tasks: MatrixTask[]; workers: MatrixWorker[]; cells: MatrixCell[] };

type StyleView = {
  workerId: string;
  sourceFilename: string | null;
  bytes: number;
  updatedAt: string;
} | null;

type Validity = {
  date: string;
  daysLeft: number;
  kind: "expira" | "rever";
  severity: string;
} | null;
type ConnStatus = "pending" | "connected" | "expired" | "revoked";
type ConnectionView = {
  toolId: string;
  toolKey: string;
  toolName: string;
  status: ConnStatus;
  grantedScopes: string[];
  requiredScopes: string[];
  missingScopes: string[];
  ready: boolean;
  connectedAt: string | null;
  validity: Validity;
};

const WRITING_RUNTIME = "assistant.writing";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { message?: string })?.message ?? `HTTP ${res.status}`);
  return body as T;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-PT");
}

/* --- Derivações a partir da matriz ---------------------------------------- */

type WorkerRollup = {
  active: number;
  ready: number;
  attention: number;
  assigned: number;
};

function rollupFor(cells: MatrixCell[], workerId: string): WorkerRollup {
  const mine = cells.filter((c) => c.workerId === workerId && c.assignmentId !== null);
  const enabled = mine.filter((c) => c.enabled);
  const ready = enabled.filter((c) => c.readiness.eligible).length;
  return {
    assigned: mine.length,
    active: enabled.length,
    ready,
    attention: enabled.length - ready,
  };
}

/* --- Selo do estilo (mesma regra do painel do worker) --------------------- */

function styleBadge(useStyle: boolean, hasStyle: boolean): { label: string; tone: string } | null {
  if (!useStyle) return null;
  return hasStyle
    ? { label: "a usar o estilo", tone: "ok" }
    : { label: "estilo pendente", tone: "warn" };
}

/* --- Conexões: rótulos/tom ------------------------------------------------ */

const STATUS_LABEL: Record<ConnStatus, string> = {
  pending: "Por ligar",
  connected: "Ligada",
  expired: "Expirada",
  revoked: "Revogada",
};

function connTone(c: ConnectionView): string {
  if (c.status === "revoked") return "danger";
  if (c.status === "expired") return "warn";
  if (c.status === "connected") return c.ready ? "ok" : "warn";
  return "muted";
}

/* --- Chip de estatística (consola) ---------------------------------------- */

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className={`wk-stat${tone ? ` wk-stat-${tone}` : ""}`}>
      <span className="wk-stat-num">{value}</span>
      <span className="wk-stat-label">{label}</span>
    </div>
  );
}

/* --- Ficha do trabalhador ------------------------------------------------- */

function WorkerFicha({
  worker,
  matrix,
  onStyleChanged,
}: {
  worker: MatrixWorker;
  matrix: Matrix;
  onStyleChanged: () => void;
}) {
  const [style, setStyle] = useState<StyleView | undefined>(undefined); // undefined = a carregar
  const [conns, setConns] = useState<ConnectionView[] | undefined>(undefined);
  const [connErr, setConnErr] = useState<string | null>(null);
  const [styleOpen, setStyleOpen] = useState(false);
  const [bg, setBg] = useState<BackgroundToken | undefined>(undefined); // undefined = a carregar
  const [mode, setMode] = useState<ModeToken | undefined>(undefined); // undefined = a carregar
  const [font, setFont] = useState<FontToken | undefined>(undefined);

  const loadStyle = useCallback(() => {
    getJson<{ style: StyleView }>(`/api/workers/${worker.id}/writing-style`)
      .then((r) => setStyle(r.style))
      .catch(() => setStyle(null));
  }, [worker.id]);

  useEffect(() => {
    setStyle(undefined);
    setConns(undefined);
    setConnErr(null);
    setBg(undefined);
    setMode(undefined);
    setFont(undefined);
    loadStyle();
    getJson<ConnectionView[]>(`/api/workers/${worker.id}/connections`)
      .then(setConns)
      .catch((e) => {
        setConns([]);
        setConnErr(e instanceof Error ? e.message : "Erro");
      });
    getJson<{ background: BackgroundToken; mode: ModeToken; font: FontToken }>(
      `/api/workers/${worker.id}/preferences`,
    )
      .then((p) => {
        setBg(p.background);
        setMode(p.mode);
        setFont(p.font);
      })
      .catch(() => {
        setBg("default");
        setMode("light");
        setFont("default");
      });
  }, [worker.id, loadStyle]);

  const swatch = BACKGROUND_SWATCHES.find((s) => s.token === bg) ?? null;

  const rollup = useMemo(() => rollupFor(matrix.cells, worker.id), [matrix.cells, worker.id]);
  const hasStyle = style != null;

  // Tarefas atribuídas a este worker (com o nome/tipo/runtime da Task).
  const taskById = useMemo(
    () => new Map(matrix.tasks.map((t) => [t.id, t] as const)),
    [matrix.tasks],
  );
  const myCells = matrix.cells.filter(
    (c) => c.workerId === worker.id && c.assignmentId !== null,
  );

  return (
    <div className="panel wk-ficha">
      <div className="wk-ficha-head">
        <div>
          <h2>{worker.email}</h2>
          <p className="muted">Ficha do trabalhador · consola do super-utilizador</p>
        </div>
      </div>

      {/* Atividade */}
      <div className="wk-stats">
        <Stat label="Atribuídas" value={rollup.assigned} />
        <Stat label="Ativas" value={rollup.active} />
        <Stat label="Prontas" value={rollup.ready} tone="ok" />
        <Stat label="A precisar de ligação" value={rollup.attention} tone={rollup.attention ? "warn" : undefined} />
      </div>

      {/* Estilo de escrita */}
      <div className="wk-block">
        <div className="wk-block-head">
          <h3>Estilo de escrita</h3>
          <button type="button" onClick={() => setStyleOpen(true)}>
            {hasStyle ? "Substituir" : "Carregar"} .md
          </button>
        </div>
        {style === undefined ? (
          <p className="muted">A carregar…</p>
        ) : style ? (
          <p className="wk-style-meta">
            <span className={`wk-pill wk-pill-ok`}>presente</span>{" "}
            {style.sourceFilename ?? "estilo.md"} · {Math.round(style.bytes / 1024) || 1} KB ·
            atualizado {fmtDate(style.updatedAt)}
          </p>
        ) : (
          <p className="muted">
            <span className="wk-pill wk-pill-muted">sem estilo</span> Ainda não há um .md de
            estilo para este trabalhador.
          </p>
        )}
      </div>

      {/* Fundo do painel (leitura) */}
      <div className="wk-block">
        <h3>Fundo do painel</h3>
        {bg === undefined ? (
          <p className="muted">A carregar…</p>
        ) : (
          <p className="wk-bg">
            <span
              className="wk-bg-swatch"
              style={
                swatch?.image
                  ? {
                      backgroundImage: `url(${swatch.image})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }
                  : { background: swatch?.swatch ?? "#f4f6f4" }
              }
              aria-hidden="true"
            />
            <span>{swatch?.label ?? "Neutro"}</span>
            {bg === "default" ? <span className="muted"> · por defeito</span> : null}
          </p>
        )}
        {mode !== undefined && (
          <p className="muted wk-mode">Modo: {mode === "dark" ? "Escuro" : "Claro"}</p>
        )}
        {font !== undefined && (
          <p className="muted wk-mode">Fonte: {fontOptionFor(font).label}</p>
        )}
      </div>

      {/* Tarefas + «usar estilo» / selo */}
      <div className="wk-block">
        <h3>Tarefas atribuídas</h3>
        {myCells.length === 0 ? (
          <p className="muted">Sem tarefas atribuídas.</p>
        ) : (
          <table className="user-table wk-tasks">
            <thead>
              <tr>
                <th>Tarefa</th>
                <th>Tipo</th>
                <th>Estado</th>
                <th>Estilo</th>
              </tr>
            </thead>
            <tbody>
              {myCells.map((c) => {
                const t = taskById.get(c.taskId);
                const isWriting = t?.runtime === WRITING_RUNTIME;
                const badge = isWriting ? styleBadge(c.useWritingStyle, hasStyle) : null;
                return (
                  <tr key={c.taskId}>
                    <td>{t?.name ?? "—"}</td>
                    <td>{t?.type === "assistant" ? "Assistida" : "Automática"}</td>
                    <td>
                      {c.enabled ? (
                        c.readiness.eligible ? (
                          <span className="wk-pill wk-pill-ok">ativa</span>
                        ) : (
                          <span className="wk-pill wk-pill-warn">ativa · em falta</span>
                        )
                      ) : (
                        <span className="wk-pill wk-pill-muted">inativa</span>
                      )}
                    </td>
                    <td>
                      {badge ? (
                        <span className={`wk-pill wk-pill-${badge.tone}`}>{badge.label}</span>
                      ) : isWriting ? (
                        <span className="muted">—</span>
                      ) : (
                        <span className="muted">n/a</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Conexões */}
      <div className="wk-block">
        <h3>Conexões</h3>
        {connErr ? <p className="panel-error">{connErr}</p> : null}
        {conns === undefined ? (
          <p className="muted">A carregar…</p>
        ) : conns.length === 0 ? (
          <p className="muted">Nenhuma ferramenta exigida pelas tarefas deste trabalhador.</p>
        ) : (
          <table className="user-table wk-conns">
            <thead>
              <tr>
                <th>Ferramenta</th>
                <th>Estado</th>
                <th>Scopes</th>
                <th>Validade</th>
              </tr>
            </thead>
            <tbody>
              {conns.map((c) => (
                <tr key={c.toolId}>
                  <td>{c.toolName}</td>
                  <td>
                    <span className={`wk-pill wk-pill-${connTone(c)}`}>
                      {STATUS_LABEL[c.status]}
                    </span>
                  </td>
                  <td>
                    {c.grantedScopes.length}/{c.requiredScopes.length}
                    {c.missingScopes.length ? (
                      <span className="muted"> · faltam {c.missingScopes.length}</span>
                    ) : null}
                  </td>
                  <td>
                    {c.validity ? (
                      <span className={`wk-validity wk-validity-${c.validity.severity}`}>
                        {c.validity.kind === "expira" ? "expira " : "rever até "}
                        {fmtDate(c.validity.date)} · {c.validity.daysLeft}d
                      </span>
                    ) : c.connectedAt ? (
                      <span className="muted">ligada {fmtDate(c.connectedAt)}</span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="muted wk-note">
          Só leitura. O admin não vê tokens nem gere as conexões — cada trabalhador liga/renova as
          suas no seu painel.
        </p>
      </div>

      {styleOpen ? (
        <WritingStyleModal
          worker={{ id: worker.id, email: worker.email }}
          onClose={() => {
            setStyleOpen(false);
            loadStyle();
            onStyleChanged();
          }}
        />
      ) : null}
    </div>
  );
}

/* --- Secção (lista + ficha) ----------------------------------------------- */

export function TrabalhadoresSection() {
  const [matrix, setMatrix] = useState<Matrix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    getJson<Matrix>("/api/assignments/matrix")
      .then((m) => {
        setMatrix(m);
        setSelectedId((cur) => cur ?? m.workers[0]?.id ?? null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Erro"));
  }, [reloadKey]);

  const selected = matrix?.workers.find((w) => w.id === selectedId) ?? null;

  return (
    <section className="console-section">
      <h1>Trabalhadores</h1>
      <p className="muted">
        Uma ficha por trabalhador: atividade das tarefas, estilo de escrita e conexões, num só
        sítio. Só o super-utilizador acede a esta página.
      </p>

      {error ? <p className="panel-error">{error}</p> : null}

      {!matrix ? (
        <div className="muted">A carregar…</div>
      ) : matrix.workers.length === 0 ? (
        <div className="panel muted">Ainda não há trabalhadores nesta organização.</div>
      ) : (
        <div className="wk-layout">
          <aside className="panel wk-list">
            <h2>Equipa</h2>
            <ul>
              {matrix.workers.map((w) => {
                const r = rollupFor(matrix.cells, w.id);
                return (
                  <li key={w.id}>
                    <button
                      type="button"
                      className={w.id === selectedId ? "wk-item active" : "wk-item"}
                      onClick={() => setSelectedId(w.id)}
                    >
                      <span className="wk-item-email">{w.email}</span>
                      <span className="wk-item-meta">
                        {r.active} ativas
                        {r.attention ? (
                          <span className="wk-dot wk-dot-warn" title="a precisar de ligação">
                            {" "}
                            · {r.attention} em falta
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          {selected ? (
            <WorkerFicha
              key={selected.id}
              worker={selected}
              matrix={matrix}
              onStyleChanged={() => setReloadKey((k) => k + 1)}
            />
          ) : (
            <div className="panel muted">Escolhe um trabalhador.</div>
          )}
        </div>
      )}
    </section>
  );
}
