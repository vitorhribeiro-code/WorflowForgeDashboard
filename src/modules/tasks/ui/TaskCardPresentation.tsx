// -------------------------------------------------------------------------- //
//  TaskCardPresentation (v42) — a ÚNICA fonte card → markup.                   //
//                                                                             //
//  Rende a camada APRESENTACIONAL de um TaskCard (blurb + blocos tipados).    //
//  Puro e read-only: sem estado, sem IO, sem mecânica (a mecânica — consolas, //
//  botão de run — deriva do runtime e vive no shell do cartão, não aqui).     //
//                                                                             //
//  Consumido por DUAS superfícies com o MESMO output, garantindo que o        //
//  preview do catálogo (super-utilizador) é IDÊNTICO à apresentação vista     //
//  pelo trabalhador — zero drift, por construção:                            //
//    1) `WorkerTasksPanel` (ilha do trabalhador), quando o cartão está ready; //
//    2) `CardPreview` (preview no catálogo, na consola).                      //
//                                                                             //
//  As classes vivem sob `.wf-trade` no globals.css (ambas as superfícies      //
//  renderizam dentro da ilha), pelo que a paleta é herdada em ambos os lados. //
// -------------------------------------------------------------------------- //

import type { PresentationBlock, TaskCard } from "../domain/card";
import { cardIcon } from "./card-icons";

function Block({ block, i }: { block: PresentationBlock; i: number }) {
  if (block.type === "emphasis") {
    return (
      <p className="wf-tc-block wf-tc-block--emphasis" key={i}>
        {block.text}
      </p>
    );
  }

  const icon = block.icon ? cardIcon(block.icon) : null;

  if (block.type === "note") {
    return (
      <div className="wf-tc-block wf-tc-block--note" key={i}>
        {icon ? <span className="wf-tc-block-ic">{icon}</span> : null}
        <span className="wf-tc-block-tx">{block.text}</span>
      </div>
    );
  }

  // kv
  return (
    <div className="wf-tc-block wf-tc-block--kv" key={i}>
      {icon ? <span className="wf-tc-block-ic">{icon}</span> : null}
      <span className="wf-tc-kv-label">{block.label}</span>
      <span className="wf-tc-kv-value">{block.value}</span>
    </div>
  );
}

export function TaskCardPresentation({
  card,
  fallbackBlurb,
}: {
  card: TaskCard;
  /** Texto a mostrar quando o blurb do cartão está vazio (ex.: semente draft). */
  fallbackBlurb?: string;
}) {
  const { blurb, blocks } = card.presentation;
  const shownBlurb = blurb.trim() !== "" ? blurb : fallbackBlurb ?? "";

  return (
    <div className="wf-tc-pres">
      {shownBlurb !== "" ? (
        <p className={`wf-tc-blurb${blurb.trim() === "" ? " is-placeholder" : ""}`}>
          {shownBlurb}
        </p>
      ) : null}
      {blocks.length > 0 ? (
        <div className="wf-tc-blocks">
          {blocks.map((b, i) => (
            <Block block={b} i={i} key={i} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
