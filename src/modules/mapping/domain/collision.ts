// -------------------------------------------------------------------------- //
//  M11 slice 2 — reconciliação/dedup. Puro (sem IO).                          //
//                                                                              //
//  Dois candidatos são "a mesma Task" quando partilham org + runtime. Dentro   //
//  desse conjunto, o nome normalizado igual é sinal FORTE (provável), o nome    //
//  diferente é sinal FRACO (possível). Nunca decidimos sozinhos: devolvemos os  //
//  matches e o admin confirma (reutilizar / criar mesmo assim).                 //
// -------------------------------------------------------------------------- //

// Existente no catálogo, já filtrado por (org + runtime) a montante.
export type ExistingTaskRef = { id: string; name: string; runtime: string };

// Match apresentado ao admin. nameMatches=true ⇒ provável; false ⇒ possível.
export type CollisionMatch = ExistingTaskRef & { nameMatches: boolean };

// Normaliza para comparação: sem acentos, minúsculas, só alfanumérico colapsado.
// "Resumo diário de emails" → "resumo diario de emails".
export function normalizeTaskName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove diacríticos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// Classifica os existentes do MESMO runtime face ao nome do candidato.
// Como já vêm filtrados por runtime, cada um é no mínimo "possível"; o nome
// igual promove-o a "provável" (nameMatches=true).
export function classifyCollisions(
  candidateName: string,
  existing: ExistingTaskRef[],
): CollisionMatch[] {
  const target = normalizeTaskName(candidateName);
  return existing.map((e) => ({
    ...e,
    nameMatches: normalizeTaskName(e.name) === target,
  }));
}
