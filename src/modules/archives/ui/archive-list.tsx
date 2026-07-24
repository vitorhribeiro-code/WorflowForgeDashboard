// Componente presentacional. Dados por props; fetch vive no hook.
// Página "Arquivo Mensal": estado do build + download quando pronto (+ reprocessar p/ admin).
"use client";
import type { MonthlyArchive } from "../domain/archive";
import type { ArchiveStatus } from "../domain/status";

const STATUS_LABEL: Record<ArchiveStatus, string> = {
  pending: "Pendente",
  running: "A construir…",
  success: "Pronto",
  error: "Erro",
};

export interface ArchiveListProps {
  archives: MonthlyArchive[];
  loading?: boolean;
  error?: string | null;
  isAdmin?: boolean;
  onDownload: (id: string) => void;
  onReprocess?: (id: string) => void;
}

export function ArchiveList({
  archives,
  loading,
  error,
  isAdmin,
  onDownload,
  onReprocess,
}: ArchiveListProps) {
  if (loading) return <p role="status">A carregar arquivos…</p>;
  if (error) return <p role="alert">Não foi possível carregar os arquivos.</p>;
  if (archives.length === 0) return <p>Ainda não há arquivos para este período.</p>;

  return (
    <ul className="archive-list">
      {archives.map((a) => {
        const ready = a.status === "success";
        const failed = a.status === "error";
        return (
          <li key={a.id}>
            <span className="period">{a.period}</span>
            <span className={`status status-${a.status}`}> · {STATUS_LABEL[a.status]}</span>
            {a.manifest ? (
              <span className="counts">
                {" "}
                · {a.manifest.runCount} runs, {a.manifest.artifactCount} artefactos
              </span>
            ) : null}
            <button type="button" disabled={!ready} onClick={() => onDownload(a.id)}>
              {ready ? "Descarregar" : "Indisponível"}
            </button>
            {isAdmin && failed && onReprocess ? (
              <button type="button" onClick={() => onReprocess(a.id)}>
                Reprocessar
              </button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
