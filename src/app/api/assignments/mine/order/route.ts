import { reorderMinePATCH } from "@/modules/assignments/api/routes";

// PATCH /api/assignments/mine/order — grava a ordem do board do trabalhador.
// Segmento estático sob /mine (não colide com o dinâmico [id]).
export function PATCH(req: Request) {
  return reorderMinePATCH(req);
}
