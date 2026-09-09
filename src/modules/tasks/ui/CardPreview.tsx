// -------------------------------------------------------------------------- //
//  CardPreview (v42) — preview do cartão no CATÁLOGO (consola).               //
//                                                                             //
//  Mostra ao super-utilizador como o cartão fica, usando o MESMO              //
//  <TaskCardPresentation> da vista do trabalhador → idêntico por construção.  //
//  Embrulhado em `.wf-app.wf-theme-dark > .wf-trade > .wf-trade-panel` para   //
//  herdar a paleta da ILHA sem contaminar a consola (precedente: o preview    //
//  do polimento da ilha, v40). A mecânica é INERTE (sem drag, sem run).       //
//                                                                             //
//  Seletor dos 3 templates: troca `card.template` localmente; «Guardar        //
//  template» persiste (via `onSave`) o TAMANHO em estado `draft` — fixa a     //
//  moldura antes de o editor a preencher.                                     //
//                                                                             //
//  v44 — editor por prompt + «Validar»:                                       //
//   · textarea de INSTRUÇÕES → o botão «Gerar/Regenerar» reusa a geração do   //
//     v43 com essas instruções (mesmo harness/validação; só orienta o texto). //
//   · «Validar» faz o flip draft→ready (via `onValidate`) — a apresentação    //
//     passa a ser mostrada ao trabalhador (se a tarefa estiver publicada).    //
//     É ORTOGONAL ao publish da tarefa (esse vive no TaskDetail).             //
// -------------------------------------------------------------------------- //

"use client";

import { useState } from "react";
import type { Task } from "../domain/types";
import {
  CARD_TEMPLATES,
  type CardStatus,
  type CardTemplate,
  type TaskCard,
} from "../domain/card";
import { TaskCardPresentation } from "./TaskCardPresentation";

const TEMPLATE_LABEL: Record<CardTemplate, string> = {
  "size-s": "Pequeno",
  "size-m": "Médio",
  "size-l": "Grande",
};

// Paleta representativa (cosmética) — o trabalhador deriva a cor do assignmentId;
// aqui não há assignment, por isso derivamos do taskId só para dar vida ao preview.
const HUES = ["#3fb968", "#4f9ad6", "#c98b3b", "#a76bd0", "#d0685f", "#4bb3a8"];
function hueFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(id.length - 1 - i)) >>> 0;
  return HUES[h % HUES.length]!;
}

function defaultTemplate(task: Task): CardTemplate {
  if (task.card) return task.card.template;
  return task.type === "automation" ? "size-s" : "size-m";
}

const DocIcon = (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden>
    <rect x="5" y="3" width="14" height="18" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
    <path d="M9 8h6M9 12h6M9 16h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);
const PlayIcon = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M8 5v14l11-7z" />
  </svg>
);

export function CardPreview({
  task,
  onSave,
  onGenerate,
  onValidate,
}: {
  task: Task;
  // Persiste o cartão (null limpa). A consola liga isto ao PUT /api/tasks/[id]/card.
  onSave: (card: TaskCard | null) => Promise<void>;
  // Gera/regenera a apresentação via IA para o template selecionado (v43+v44).
  // `instructions` (v44) orienta o texto; ausente ⇒ geração de raiz. Opcional:
  // se ausente, o bloco de geração não aparece. Liga ao POST .../card/generate.
  onGenerate?: (template: CardTemplate, instructions?: string) => Promise<void>;
  // v44: flip do estado do cartão (draft↔ready). Opcional: se ausente, o botão
  // «Validar» não aparece. Liga ao POST .../card/status.
  onValidate?: (status: CardStatus) => Promise<void>;
}) {
  const [template, setTemplate] = useState<CardTemplate>(defaultTemplate(task));
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const isAuto = task.type === "automation";
  const hue = hueFor(task.id);
  const status = task.card?.status ?? null;
  // Há conteúdo real a validar? (o esqueleto-semente tem blurb vazio → não).
  const hasContent = (task.card?.presentation.blurb.trim().length ?? 0) > 0;

  // Cartão a pré-visualizar: presentation atual (se houver) sob o template
  // selecionado; senão semente vazia (o render mostra placeholder).
  const previewCard: TaskCard = {
    template,
    status: status ?? "draft",
    presentation: task.card?.presentation ?? { blurb: "", blocks: [] },
  };

  async function save() {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      // Guardar o template refaz o cartão como draft (mudar o tamanho obriga a
      // revalidar/repreencher). Preserva a presentation existente, se válida.
      const card: TaskCard = {
        template,
        status: "draft",
        presentation: task.card?.presentation ?? { blurb: "", blocks: [] },
      };
      await onSave(card);
      setMsg(`Template «${TEMPLATE_LABEL[template]}» guardado (rascunho).`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro a guardar o cartão");
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    if (!onGenerate) return;
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      // A IA compõe a apresentação para o template selecionado; nasce em rascunho.
      // Com instruções (v44) regenera orientada; o harness (validateCard) garante
      // sempre um cartão válido. O parent faz refetch.
      const instr = instructions.trim();
      await onGenerate(template, instr || undefined);
      setMsg(
        instr
          ? `Cartão regenerado para «${TEMPLATE_LABEL[template]}» (rascunho).`
          : `Cartão gerado para «${TEMPLATE_LABEL[template]}» (rascunho).`,
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro a gerar o cartão");
    } finally {
      setBusy(false);
    }
  }

  async function validate(next: CardStatus) {
    if (!onValidate) return;
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      // draft→ready («Validar»): a apresentação passa a ser mostrada ao
      // trabalhador. ready→draft («Voltar a rascunho»): volta a escondê-la.
      await onValidate(next);
      setMsg(
        next === "ready"
          ? "Cartão validado — o trabalhador passa a ver a apresentação (se a tarefa estiver publicada)."
          : "Cartão devolvido a rascunho — deixa de aparecer ao trabalhador.",
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro a mudar o estado do cartão");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card-preview">
      <div className="card-preview-head">
        <h3>Cartão da tarefa</h3>
        {status ? (
          <span className={`card-status card-status--${status}`}>
            {status === "ready" ? "Validado" : "Rascunho"}
          </span>
        ) : (
          <span className="card-status card-status--none">Sem cartão</span>
        )}
      </div>
      <p className="muted">
        Como o trabalhador vê a tarefa quando o cartão está validado. Enquanto for rascunho, só
        aparece aqui. Escolhe o tamanho da moldura; o conteúdo preenche-se no editor.
      </p>

      <div className="card-tpl" role="group" aria-label="Tamanho do cartão">
        {CARD_TEMPLATES.map((t) => (
          <button
            key={t}
            type="button"
            className={`card-tpl-btn${t === template ? " on" : ""}`}
            aria-pressed={t === template}
            onClick={() => setTemplate(t)}
          >
            {TEMPLATE_LABEL[t]}
          </button>
        ))}
      </div>

      {/* Palco da ilha: `.wf-trade` traz a moldura escura + todos os `--wf-*`
          da ilha. NÃO usamos `.wf-app` (imporia o shell 100vh/grid do trabalhador);
          as regras do cartão são `.wf-trade .wf-tc` (ou globais), por isso basta. */}
      <div className="card-preview-stage">
        <div className="wf-trade">
          <div className="wf-trade-panel">
            <article className="wf-tc" style={{ "--tc": hue } as React.CSSProperties}>
              <header className="wf-tc-top">
                <span className="wf-tc-ic">{DocIcon}</span>
                <div className="wf-tc-meta">
                  <div className="wf-tc-id">#{isAuto ? "A" : "B"}-00</div>
                  <div className="wf-tc-nm">{task.name}</div>
                </div>
              </header>

              <div className={`wf-tc-mid ${template}`}>
                <TaskCardPresentation
                  card={previewCard}
                  fallbackBlurb="Sem descrição ainda — o editor preenche o cartão."
                />
                <span className="wf-tc-type">
                  <span className="wf-tc-dot" aria-hidden />
                  {isAuto ? "Automática" : "Assistida"}
                </span>
              </div>

              <footer className="wf-tc-bot">
                {isAuto ? (
                  <span className="wf-tc-play wf-tc-play--inert" aria-hidden>
                    {PlayIcon}
                  </span>
                ) : null}
                <span className="status-pill status-grey">
                  <span className="readiness-dot" aria-hidden />
                  Pré-visualização
                </span>
              </footer>
            </article>
          </div>
        </div>
      </div>

      {/* v44 — editor por prompt: instruções livres orientam a (re)geração. */}
      {onGenerate ? (
        <div className="card-gen-editor">
          <label className="card-gen-label" htmlFor="card-instructions">
            Instruções para a IA <span className="muted">(opcional)</span>
          </label>
          <textarea
            id="card-instructions"
            className="card-gen-input"
            rows={2}
            value={instructions}
            disabled={busy}
            placeholder={
              task.card
                ? "Ex.: mais direto; realça a cadência; menos técnico."
                : "Ex.: destaca o valor para quem recebe; tom simples."
            }
            onChange={(e) => setInstructions(e.target.value)}
          />
        </div>
      ) : null}

      <div className="card-preview-actions">
        <button type="button" disabled={busy} onClick={save}>
          Guardar template ({TEMPLATE_LABEL[template]})
        </button>
        {onGenerate ? (
          <button
            type="button"
            className="card-gen-btn"
            disabled={busy}
            onClick={generate}
            title="A IA compõe a apresentação para o tamanho selecionado (rascunho)."
          >
            {task.card ? "Regenerar com IA" : "Gerar com IA"}
          </button>
        ) : null}
        {/* v44 — «Validar» (draft→ready) / «Voltar a rascunho» (ready→draft). */}
        {onValidate && status === "draft" ? (
          <button
            type="button"
            className="card-validate-btn"
            disabled={busy || !hasContent}
            onClick={() => validate("ready")}
            title={
              hasContent
                ? "Torna a apresentação visível ao trabalhador (se a tarefa estiver publicada)."
                : "Gera ou escreve conteúdo antes de validar."
            }
          >
            Validar cartão
          </button>
        ) : null}
        {onValidate && status === "ready" ? (
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={() => validate("draft")}
            title="Volta o cartão a rascunho — deixa de aparecer ao trabalhador."
          >
            Voltar a rascunho
          </button>
        ) : null}
        {msg ? <span className="panel-note">{msg}</span> : null}
        {err ? <span className="panel-error">{err}</span> : null}
      </div>

      {/* Nota de fronteira (v42 §2): validar o cartão ≠ publicar a tarefa. */}
      {onValidate && status === "ready" ? (
        <p className="muted card-preview-hint">
          Cartão validado. Para o trabalhador o ver, a tarefa também tem de estar{" "}
          <strong>publicada</strong> (botão «Publicar», acima).
        </p>
      ) : null}
    </div>
  );
}
