// -------------------------------------------------------------------------- //
//  TaskLifecycle (v45) — UX unificada dos três estados ortogonais.            //
//                                                                             //
//  Puramente presentacional: deriva TUDO de `taskLifecycle()` (domínio), que  //
//  é a fonte única da terminologia. Dois variantes:                           //
//   · <TaskLifecycleChips>  — dois chips compactos (Tarefa · Cartão) para o    //
//     cabeçalho de coluna da matriz de Atribuições.                           //
//   · <TaskLifecycleStrip>  — os passos ordenados (Publicar → Validar →        //
//     Ativar) para o topo da ficha da tarefa no Catálogo. O 3.º passo é       //
//     informativo (é por-trabalhador, vive na matriz) para deixar a fronteira //
//     clara sem o colapsar nos outros dois.                                   //
//                                                                             //
//  Chrome de CONSOLA (tokens `--text`/`--muted`/`--border`/`--accent`).       //
// -------------------------------------------------------------------------- //

"use client";

import type { CardStatus } from "../domain/card";
import { taskLifecycle } from "../domain/lifecycle";

type Props = { published: boolean; cardStatus: CardStatus | null };

// Tom do chip do cartão: validado = ok (verde), rascunho = aviso, nenhum = neutro.
function cardTone(cardStatus: CardStatus | null): "ok" | "warn" | "none" {
  if (cardStatus === "ready") return "ok";
  if (cardStatus === "draft") return "warn";
  return "none";
}

export function TaskLifecycleChips({ published, cardStatus }: Props) {
  const lc = taskLifecycle({ published, cardStatus });
  return (
    <span className="tlc" aria-label={`${lc.taskLabel} · ${lc.cardLabel}`} title={lc.nextHint}>
      <span className={`tlc-chip tlc-${published ? "ok" : "draft"}`}>{lc.taskLabel}</span>
      <span className={`tlc-chip tlc-${cardTone(cardStatus)}`}>{lc.cardLabel}</span>
    </span>
  );
}

export function TaskLifecycleStrip({ published, cardStatus }: Props) {
  const lc = taskLifecycle({ published, cardStatus });
  return (
    <div className="tls" role="group" aria-label="Ciclo de vida da tarefa">
      <ol className="tls-steps">
        <li className={`tls-step ${lc.publishDone ? "done" : "todo"}`}>
          <span className="tls-num" aria-hidden>
            1
          </span>
          <span className="tls-body">
            <span className="tls-name">Publicar tarefa</span>
            <span className="tls-state">
              {lc.publishDone ? "Publicada — atribuível" : "Rascunho — não atribuível"}
            </span>
          </span>
        </li>
        <li className={`tls-step ${lc.cardDone ? "done" : "todo"}`}>
          <span className="tls-num" aria-hidden>
            2
          </span>
          <span className="tls-body">
            <span className="tls-name">Validar cartão</span>
            <span className="tls-state">{lc.cardLabel}</span>
          </span>
        </li>
        <li className="tls-step info">
          <span className="tls-num" aria-hidden>
            3
          </span>
          <span className="tls-body">
            <span className="tls-name">Ativar por trabalhador</span>
            <span className="tls-state">
              Na{" "}
              <a href="/console/atribuicoes" className="tls-link">
                matriz de Atribuições
              </a>{" "}
              (interruptor ON/OFF)
            </span>
          </span>
        </li>
      </ol>
      <p className="tls-hint muted">{lc.nextHint}</p>
    </div>
  );
}
