import { myRunsGET } from "@/modules/runs/api/routes";

// GET /api/runs/mine — feed dos últimos Runs do trabalhador autenticado.
// Segmento estático sob /runs: precede o dinâmico [id] (mesmo padrão de
// /assignments/mine). `?limit=` opcional.
export function GET(req: Request) {
  return myRunsGET(req);
}
