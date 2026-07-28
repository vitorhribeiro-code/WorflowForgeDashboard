import { myAssignmentsGET } from "@/modules/assignments/api/routes";

// GET /api/assignments/mine — atribuições do trabalhador autenticado.
// Segmento estático: precede o dinâmico [id] (mesmo padrão de /matrix).
export function GET(req: Request) {
  return myAssignmentsGET(req);
}
