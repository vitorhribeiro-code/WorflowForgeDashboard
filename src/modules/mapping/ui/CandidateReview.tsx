import type { ReviewedCandidate } from "./hooks";

type Props = {
  candidates: ReviewedCandidate[] | null;
  warnings?: string[];
  onConvert?: (candidate: ReviewedCandidate) => void;
};

// Presentacional puro: mostra rascunhos e o que falta para converter.
export function CandidateReview({ candidates, warnings = [], onConvert }: Props) {
  if (!candidates) return <div className="mapping-empty">Importa um mapeamento para começar.</div>;

  return (
    <div className="candidate-review">
      {warnings.length > 0 ? (
        <ul className="mapping-warnings">
          {warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      ) : null}

      <ul className="candidate-list">
        {candidates.map((c) => (
          <li key={c.sourceRef} className="candidate">
            <div className="candidate-head">
              <strong>{c.name}</strong>
              <span className="candidate-type">{c.type}</span>
            </div>
            {c.description ? <p>{c.description}</p> : null}
            <p className="candidate-meta">
              runtime: <code>{c.runtime ?? "—"}</code> · tools: {c.requiredTools.length}
            </p>
            {c.completeness.convertible ? (
              <button type="button" onClick={() => onConvert?.(c)}>
                Converter em Task
              </button>
            ) : (
              <p className="candidate-missing">Falta: {c.completeness.missing.join(", ")}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
