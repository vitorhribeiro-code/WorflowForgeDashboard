import { parsePOST } from "@/modules/mapping/api/routes";

// POST /api/mapping/parse — documento de mapeamento → candidatos (M11).
// Nada é persistido: o documento é efémero e só origina rascunhos de Task.
export function POST(req: Request) {
  return parsePOST(req);
}
