// Componente presentacional. Recebe dados por props; a lógica de fetch vive no hook.
// Usado no Detalhe de Run: artefactos por tier, com location e ação de download.
"use client";
import type { ArtifactView } from "../domain/artifact";

const TIER_LABEL: Record<ArtifactView["tier"], string> = {
  work_document: "Documentos finais (cloud do trabalhador)",
  intermediate: "Intermédios (efémeros)",
};

const LOCATION_LABEL: Record<ArtifactView["location"], string> = {
  worker_cloud: "Cloud do trabalhador",
  ephemeral: "Store efémero",
};

export interface ArtifactListProps {
  artifacts: ArtifactView[];
  loading?: boolean;
  error?: string | null;
  onDownload: (artifactId: string) => void;
}

export function ArtifactList({ artifacts, loading, error, onDownload }: ArtifactListProps) {
  if (loading) return <p role="status">A carregar artefactos…</p>;
  if (error) return <p role="alert">Não foi possível carregar os artefactos.</p>;
  if (artifacts.length === 0) return <p>Este run ainda não gerou artefactos.</p>;

  const byTier = groupByTier(artifacts);

  return (
    <div className="artifact-list">
      {(Object.keys(byTier) as ArtifactView["tier"][]).map((tier) => (
        <section key={tier}>
          <h3>{TIER_LABEL[tier]}</h3>
          <ul>
            {byTier[tier]!.map((a) => (
              <li key={a.id}>
                <span className="filename">{a.filename}</span>
                {a.mimeType ? <span className="mime"> · {a.mimeType}</span> : null}
                <span className="location"> · {LOCATION_LABEL[a.location]}</span>
                {a.expired ? (
                  <span className="expired" title="Efémero expirado (TTL)"> · expirado</span>
                ) : null}
                <button
                  type="button"
                  disabled={!a.downloadable}
                  onClick={() => onDownload(a.id)}
                >
                  {a.downloadable ? "Descarregar" : "Indisponível"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function groupByTier(items: ArtifactView[]): Partial<Record<ArtifactView["tier"], ArtifactView[]>> {
  const out: Partial<Record<ArtifactView["tier"], ArtifactView[]>> = {};
  for (const a of items) (out[a.tier] ??= []).push(a);
  return out;
}
