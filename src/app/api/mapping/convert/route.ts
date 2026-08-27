import { convertPOST } from "@/modules/mapping/api/routes";

// POST /api/mapping/convert — candidato (+ overrides) → Task no catálogo
// (M11 delega no M4, que valida config_schema/runtime/scopes).
export function POST(req: Request) {
  return convertPOST(req);
}
