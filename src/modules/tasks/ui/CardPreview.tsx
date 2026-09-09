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
//  moldura antes de o editor (v44) a preencher. A persistência de conteúdo    //
//  e o flip draft→ready são do v44.                                          //
// -------------------------------------------------------------------------- //

"use client";

import { useState } from "react";
import type { Task } from "../domain/types";
import { CARD_TEMPLATES, type CardTemplate, type TaskCard } from "../domain/card";
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
}: {
  task: Task;
  // Persiste o cartão (null limpa). A consola liga isto ao PUT /api/tasks/[id]/card.
  onSave: (card: TaskCard | null) => Promise<void>;
  // Gera a apresentação via IA para o template selecionado (v43). Opcional: se
  // ausente, o botão «Gerar com IA» não aparece. Liga ao POST .../card/generate.
  onGenerate?: (template: CardTemplate) => Promise<void>;
}) {
  const [template, setTemplate] = useState<CardTemplate>(defaultTemplate(task));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const isAuto = task.type === "automation";
  const hue = hueFor(task.id);
  const status = task.card?.status ?? null;

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
      // O harness (validateCard) garante um cartão válido; o parent faz refetch.
      await onGenerate(template);
      setMsg(`Cartão gerado para «${TEMPLATE_LABEL[template]}» (rascunho).`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro a gerar o cartão");
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
            Gerar com IA
          </button>
        ) : null}
        {msg ? <span className="panel-note">{msg}</span> : null}
        {err ? <span className="panel-error">{err}</span> : null}
      </div>
    </div>
  );
}
