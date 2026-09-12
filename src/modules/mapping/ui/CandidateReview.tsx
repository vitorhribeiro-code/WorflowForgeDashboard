import type { ReviewedCandidate } from "./hooks";
import type { MatchProposal } from "../service/runtime-matcher";

type Props = {
  candidates: ReviewedCandidate[] | null;
  warnings?: string[];
  // Seleção em lote (opcional): quando presente, mostra uma checkbox por
  // candidato convertível. O estado da seleção vive no chamador.
  selected?: Set<string>;
  onToggleSelect?: (sourceRef: string) => void;
  onConvert?: (candidate: ReviewedCandidate) => void;
  // v53: propostas de runtime (por sourceRef) e handler de aceitação.
  proposals?: Record<string, MatchProposal>;
  onAcceptProposal?: (candidate: ReviewedCandidate, proposal: MatchProposal) => void;
};

// Presentacional puro: mostra rascunhos e o que falta para converter.
export function CandidateReview({
  candidates,
  warnings = [],
  selected,
  onToggleSelect,
  onConvert,
  proposals,
  onAcceptProposal,
}: Props) {
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
              {onToggleSelect && c.completeness.convertible ? (
                <input
                  type="checkbox"
                  className="candidate-check"
                  checked={selected?.has(c.sourceRef) ?? false}
                  onChange={() => onToggleSelect(c.sourceRef)}
                  aria-label={`Selecionar ${c.name}`}
                />
              ) : null}
              <strong>{c.name}</strong>
              <span className="candidate-type">{c.type}</span>
            </div>
            {c.description ? <p>{c.description}</p> : null}
            <p className="candidate-meta">
              runtime: <code>{c.runtime ?? "—"}</code> · tools: {c.requiredTools.length}
            </p>
            {proposals && proposals[c.sourceRef] ? (
              <RuntimeProposalBlock
                proposal={proposals[c.sourceRef]!}
                onAccept={onAcceptProposal ? (p) => onAcceptProposal(c, p) : undefined}
              />
            ) : null}
            {c.completeness.convertible ? (
              onConvert ? (
                <button type="button" onClick={() => onConvert(c)}>
                  Converter em Task
                </button>
              ) : null
            ) : (
              <p className="candidate-missing">Falta: {c.completeness.missing.join(", ")}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Bloco da proposta de runtime (v53): reutilizar existente, criar novo, ou nada.
function RuntimeProposalBlock({
  proposal,
  onAccept,
}: {
  proposal: MatchProposal;
  onAccept?: (proposal: MatchProposal) => void;
}) {
  if (proposal.kind === "existing") {
    return (
      <div className="candidate-proposal">
        <span className="muted">
          IA sugere reutilizar: <strong>{proposal.label}</strong> (<code>{proposal.runtimeKey}</code>)
        </span>
        {onAccept ? (
          <button type="button" onClick={() => onAccept(proposal)}>
            Usar e converter
          </button>
        ) : null}
      </div>
    );
  }
  if (proposal.kind === "new") {
    return (
      <div className="candidate-proposal">
        <span className="muted">
          IA sugere criar: <strong>{proposal.label}</strong> (<code>{proposal.key}</code>) —{" "}
          {proposal.instruction}
        </span>
        {onAccept ? (
          <button type="button" onClick={() => onAccept(proposal)}>
            Criar e converter
          </button>
        ) : null}
      </div>
    );
  }
  return (
    <p className="muted candidate-proposal">
      IA: sem correspondência{proposal.reason ? ` (${proposal.reason})` : ""} — cria um runtime no
      Catálogo e volta a sugerir.
    </p>
  );
}
