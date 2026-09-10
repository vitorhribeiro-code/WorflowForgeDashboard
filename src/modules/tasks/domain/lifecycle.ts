// -------------------------------------------------------------------------- //
//  Ciclo de vida de AUTORIA de uma Task — a fonte ÚNICA da terminologia que    //
//  distingue os três estados que se confundiam (v42 §2, handoff v44 §5.2):     //
//                                                                              //
//   1. published          (TAREFA)  — a tarefa é atribuível?                   //
//   2. card.status         (CARTÃO) — mostra-se a apresentação AUTORAL?        //
//   3. assignment.enabled  (SWITCH) — está a trabalhar para um trabalhador?    //
//                                                                              //
//  Os dois primeiros eixos (publicar → validar) são de AUTORIA e vivem no      //
//  catálogo; o terceiro (ativar) é POR-TRABALHADOR e vive na matriz. São       //
//  ORTOGONAIS: um cartão em rascunho NÃO esconde a tarefa — o trabalhador       //
//  vê-a na mesma com a apresentação DERIVADA; validar só troca o derivado      //
//  pela apresentação autoral. Este helper descreve o eixo de AUTORIA           //
//  (published + card); o Switch é um eixo à parte. Puro e determinístico.      //
// -------------------------------------------------------------------------- //

import type { CardStatus } from "./card";

export type TaskLifecycleStage =
  | "unpublished" // rascunho: a tarefa nem é atribuível
  | "no_card" // publicada, ainda sem cartão (o worker vê o derivado)
  | "card_draft" // publicada, cartão em rascunho (o worker vê o derivado)
  | "live"; // publicada + cartão validado (o worker vê a apresentação autoral)

export type TaskLifecycle = {
  stage: TaskLifecycleStage;
  published: boolean;
  cardStatus: CardStatus | null;
  // Passos de AUTORIA, por ordem (publicar → validar). O 3.º (ativar) é por-célula.
  publishDone: boolean;
  cardDone: boolean;
  // Selos curtos (chip da matriz / cabeçalho do catálogo).
  taskLabel: string; // "Rascunho" | "Publicada"
  cardLabel: string; // "Sem cartão" | "Cartão em rascunho" | "Cartão validado"
  // Próximo passo lógico (tooltip/hint no catálogo).
  nextHint: string;
};

export function taskLifecycle(input: {
  published: boolean;
  cardStatus: CardStatus | null;
}): TaskLifecycle {
  const { published, cardStatus } = input;

  const stage: TaskLifecycleStage = !published
    ? "unpublished"
    : cardStatus === "ready"
      ? "live"
      : cardStatus === "draft"
        ? "card_draft"
        : "no_card";

  const cardLabel =
    cardStatus === "ready"
      ? "Cartão validado"
      : cardStatus === "draft"
        ? "Cartão em rascunho"
        : "Sem cartão";

  const nextHint = !published
    ? "Publica a tarefa para a poderes atribuir a trabalhadores."
    : cardStatus === "ready"
      ? "Pronta. Ativa-a por trabalhador na matriz de Atribuições."
      : cardStatus === "draft"
        ? "Valida o cartão para o trabalhador ver a apresentação que compuseste (sem isso vê a versão automática)."
        : "Gera e valida um cartão para uma apresentação autoral (opcional; sem isso o trabalhador vê a versão automática).";

  return {
    stage,
    published,
    cardStatus,
    publishDone: published,
    cardDone: cardStatus === "ready",
    taskLabel: published ? "Publicada" : "Rascunho",
    cardLabel,
    nextHint,
  };
}
